"""Provider-agnostic incident/RCA service.

Reads incidents from whichever ticketing backend INCIDENT_PROVIDER selects
(jira | servicenow) via an in-process MCP server (see app.mcp_servers and
app.services.mcp_client), then derives the incident board, summary and RCA
views. The provider-specific field mapping happens inside the MCP servers; this
module only aggregates the already-normalized records.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional

from ..cache import cached
from ..models.incidents import IncidentRecord, IncidentSummary
from ..models.rca import LifecycleStage, RcaLifecycle, RepeatIncident
from . import tags_service
from .mcp_client import get_provider_client

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Fetch (cached; cache key includes the active project via cache.py)
# ---------------------------------------------------------------------------

@cached("short")
def _fetch(days: int = 30) -> List[dict]:
    """Fetch normalized incident records from the active provider (MCP)."""
    project = tags_service.active_project()
    client = get_provider_client()
    records = client.call("list_incidents", {"project": project, "days": days})
    return records or []


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _parse_dt(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (ValueError, TypeError, AttributeError):
        return None


def _age(created: Optional[str]) -> str:
    dt = _parse_dt(created)
    if not dt:
        return "—"
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    delta = datetime.now(timezone.utc) - dt
    hours, rem = divmod(int(delta.total_seconds()), 3600)
    return f"{hours}h {rem // 60:02d}m"


def _avg(xs: List[float]) -> float:
    return round(sum(xs) / len(xs), 2) if xs else 0.0


# ---------------------------------------------------------------------------
# Public API (the surface the incident/overview/rca routers and agent_service call)
# ---------------------------------------------------------------------------

def list_records(limit: int = 50) -> List[IncidentRecord]:
    """Return incidents as board records."""
    out: List[IncidentRecord] = []
    for rec in _fetch(days=14)[:limit]:
        try:
            out.append(
                IncidentRecord(
                    id=rec["id"],
                    title=rec.get("title") or "",
                    severity=rec.get("severity") or "P3",
                    status=rec.get("status") or "Open",
                    pipeline=rec.get("pipeline") or "Unknown",
                    domain=rec.get("domain") or "",
                    createdAt=rec.get("createdAt") or datetime.now(timezone.utc).isoformat(),
                    owner=rec.get("owner") or "Unassigned",
                    age=_age(rec.get("createdAt")),
                )
            )
        except Exception as exc:  # noqa: BLE001
            log.warning("Error mapping incident %s: %s", rec.get("id"), exc)
            continue
    return out


def summary() -> IncidentSummary:
    """Aggregate an incident summary (open / resolved-24h / severity counts)."""
    open_count = resolved_24h = p1 = p2 = p3 = 0
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)

    for rec in _fetch(days=7):
        severity = rec.get("severity") or "P3"
        status = rec.get("status") or "Open"

        if severity == "P1":
            p1 += 1
        elif severity == "P2":
            p2 += 1
        elif severity == "P3":
            p3 += 1

        if status != "Resolved":
            open_count += 1
        else:
            resolved = _parse_dt(rec.get("resolvedAt"))
            if resolved is not None:
                if resolved.tzinfo is None:
                    resolved = resolved.replace(tzinfo=timezone.utc)
                if resolved >= cutoff:
                    resolved_24h += 1

    return IncidentSummary(
        open=open_count,
        acknowledged=0,  # neither provider exposes a distinct "acknowledged" state
        resolved24h=resolved_24h,
        p1=p1,
        p2=p2,
        p3=p3,
    )


@cached("short")
def get_timeline(incident_id: str) -> List[dict]:
    """Status-change history for a single incident from the active provider.

    Returns ascending ``[{status, timestamp}]`` events (creation first); a
    single-element list when the provider has no history.
    """
    client = get_provider_client()
    events = client.call("get_incident_timeline", {"incident_id": incident_id}) or []
    events.sort(key=lambda e: e.get("timestamp") or "")
    return events


@cached("medium")
def rca_lifecycle(days: int = 30) -> RcaLifecycle:
    resolve: List[float] = []
    for rec in _fetch(days=days):
        created = _parse_dt(rec.get("createdAt"))
        resolved = _parse_dt(rec.get("resolvedAt"))
        if created and resolved:
            resolve.append((resolved - created).total_seconds() / 60.0)

    stages = [
        LifecycleStage(stage="Detect", avgMinutes=0.0),
        LifecycleStage(stage="Acknowledge", avgMinutes=0.0),
        LifecycleStage(stage="Mitigate", avgMinutes=0.0),
        LifecycleStage(stage="Resolve", avgMinutes=_avg(resolve)),
        LifecycleStage(stage="RCA Published", avgMinutes=0.0),
    ]
    return RcaLifecycle(stages=stages)


@cached("medium")
def rca_repeat_incidents(days: int = 30, top_n: int = 10) -> List[RepeatIncident]:
    records = list_records(limit=100)
    counts: Dict[str, int] = {}
    last_seen: Dict[str, str] = {}
    causes: Dict[str, str] = {}

    for record in records:
        pipeline = record.pipeline or "Unknown"
        counts[pipeline] = counts.get(pipeline, 0) + 1
        if pipeline not in last_seen or record.createdAt > last_seen[pipeline]:
            last_seen[pipeline] = record.createdAt
            causes[pipeline] = record.title

    out: List[RepeatIncident] = []
    for pipeline, count in sorted(counts.items(), key=lambda kv: kv[1], reverse=True)[:top_n]:
        if count < 2:
            continue
        out.append(
            RepeatIncident(
                pipeline=pipeline,
                occurrences=count,
                lastSeen=last_seen[pipeline],
                rootCause=causes.get(pipeline, "Unknown"),
            )
        )
    return out


def create_ticket(
    summary: str,
    description: str,
    priority: str = "Medium",
    issue_type: Optional[str] = None,
) -> str:
    """Create a ticket in the active provider; return its id/key/number.

    The currently selected project (X-Project header) is passed to the provider
    so the ticket is tagged with it (Jira label / ServiceNow project field).
    When 'all' is selected, ``active_project()`` is None and no tag is set.
    """
    client = get_provider_client()
    project = tags_service.active_project()
    result = client.call(
        "create_incident",
        {
            "summary": summary,
            "description": description,
            "priority": priority,
            "issue_type": issue_type,
            "project": project,
        },
    )
    if isinstance(result, dict):
        return str(result.get("id") or result)
    return str(result)
