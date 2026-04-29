"""Jira-backed incident data service."""
from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from jira import JIRA
from jira.exceptions import JIRAError

from ..config import get_settings
from ..models.incidents import IncidentRecord, IncidentSummary
from ..models.rca import LifecycleStage, RcaLifecycle, RepeatIncident
from ..cache import cached

log = logging.getLogger(__name__)


class JiraClient:
    """Singleton Jira client wrapper."""
    
    _instance: Optional[JIRA] = None
    
    @classmethod
    def get_client(cls) -> JIRA:
        """Get or create Jira client."""
        if cls._instance is None:
            settings = get_settings()
            if not settings.jira_url or not settings.jira_username or not settings.jira_api_token:
                raise ValueError("Jira credentials not configured (jira_url, jira_username, jira_api_token)")
            
            try:
                cls._instance = JIRA(
                    server=settings.jira_url,
                    basic_auth=(settings.jira_username, settings.jira_api_token),
                    options={"verify": True}
                )
                log.info("Connected to Jira: %s", settings.jira_url)
            except JIRAError as exc:
                log.error("Failed to connect to Jira: %s", exc)
                raise
        
        return cls._instance


def _get_incident_age(created_date: str) -> str:
    """Calculate human-readable age from created date."""
    try:
        created = datetime.fromisoformat(created_date.replace("Z", "+00:00"))
        delta = datetime.now(timezone.utc) - created
        hours, rem = divmod(int(delta.total_seconds()), 3600)
        minutes = rem // 60
        return f"{hours}h {minutes:02d}m"
    except (ValueError, AttributeError):
        return "—"


def _map_priority_to_severity(priority: Optional[object]) -> str:
    """Map Jira priority to severity (P1-P4)."""
    settings = get_settings()
    if not priority:
        return "P3"
    
    # Handle priority object - get the name attribute if it exists
    priority_name = priority.name if hasattr(priority, 'name') else str(priority)
    if not priority_name:
        return "P3"
    
    priority_mapping = settings.jira_priority_mapping
    return priority_mapping.get(priority_name, "P3")


def _map_status_to_incident_status(jira_status: Optional[str]) -> str:
    """Map Jira status to incident status."""
    settings = get_settings()
    if not jira_status:
        return "Open"
    
    status_mapping = settings.jira_status_mapping
    return status_mapping.get(jira_status, "Open")


@cached("short")
def list_issues(days: int = 30) -> List:
    """Fetch Jira issues from the configured project."""
    settings = get_settings()
    client = JiraClient.get_client()
    
    try:
        # Build JQL query - no date filter for now to get all issues
        jql = (
            f"project = {settings.jira_project_key} "
            "ORDER BY created DESC"
        )
        
        issues = client.search_issues(jql, maxResults=None)
        log.info("Fetched %d issues from Jira project %s", len(issues), settings.jira_project_key)
        return issues
    
    except JIRAError as exc:
        log.error("Failed to fetch Jira issues: %s", exc)
        raise


def list_records(limit: int = 50) -> List[IncidentRecord]:
    """Convert Jira issues to incident records."""
    try:
        issues = list_issues(days=14)
        out: List[IncidentRecord] = []
        
        for issue in issues[:limit]:
            try:
                created_str = issue.fields.created
                created = datetime.fromisoformat(created_str.replace("Z", "+00:00"))
                
                record = IncidentRecord(
                    id=issue.key,
                    title=issue.fields.summary,
                    severity=_map_priority_to_severity(issue.fields.priority),
                    status=_map_status_to_incident_status(issue.fields.status.name if issue.fields.status else None),
                    pipeline=issue.fields.project.name,
                    domain=issue.fields.assignee.displayName if issue.fields.assignee else issue.fields.issuetype.name,
                    createdAt=created.isoformat(),
                    owner=issue.fields.assignee.displayName if issue.fields.assignee else "Unassigned",
                    age=_get_incident_age(created_str),
                )
                out.append(record)
            except Exception as exc:
                log.warning("Error converting issue %s: %s", issue.key, exc)
                continue
        
        return out
    
    except Exception as exc:
        log.error("Error converting Jira issues to incident records: %s", exc)
        raise


def summary() -> IncidentSummary:
    """Generate incident summary from Jira issues."""
    try:
        issues = list_issues(days=7)
        
        open_count = 0
        resolved_24h = 0
        p1_count = 0
        p2_count = 0
        p3_count = 0
        
        cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
        
        for issue in issues:
            try:
                status = _map_status_to_incident_status(issue.fields.status.name if issue.fields.status else None)
                severity = _map_priority_to_severity(issue.fields.priority)
                
                # Count by severity
                if severity == "P1":
                    p1_count += 1
                elif severity == "P2":
                    p2_count += 1
                elif severity == "P3":
                    p3_count += 1
                
                # Count open issues
                if status != "Resolved":
                    open_count += 1
                
                # Count resolved in last 24h
                if status == "Resolved":
                    try:
                        resolved_str = issue.fields.resolutiondate or issue.fields.updated
                        resolved = datetime.fromisoformat(resolved_str.replace("Z", "+00:00"))
                        if resolved >= cutoff:
                            resolved_24h += 1
                    except (ValueError, AttributeError):
                        pass
            except Exception as exc:
                log.warning("Error processing issue %s for summary: %s", issue.key, exc)
                continue
        
        return IncidentSummary(
            open=open_count,
            acknowledged=0,  # Jira doesn't have direct acknowledgement field
            resolved24h=resolved_24h,
            p1=p1_count,
            p2=p2_count,
            p3=p3_count,
        )
    
    except Exception as exc:
        log.error("Error generating Jira incident summary: %s", exc)
        raise


def _parse_datetime(value: Optional[str]):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None


def _avg(xs: List[float]) -> float:
    return round(sum(xs) / len(xs), 2) if xs else 0.0


def _resolution_time(created: Optional[str], resolution: Optional[str]) -> Optional[float]:
    created_dt = _parse_datetime(created)
    resolution_dt = _parse_datetime(resolution)
    if not created_dt or not resolution_dt:
        return None
    return (resolution_dt - created_dt).total_seconds() / 60.0


@cached("medium")
def rca_lifecycle(days: int = 30) -> RcaLifecycle:
    issues = list_issues(days=days)
    resolve: List[float] = []

    for issue in issues:
        try:
            duration = _resolution_time(issue.fields.created, getattr(issue.fields, "resolutiondate", None))
            if duration is not None:
                resolve.append(duration)
        except Exception as exc:
            log.warning("Error computing RCA lifecycle for issue %s: %s", issue.key, exc)
            continue

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
    counts: dict[str, int] = {}
    last_seen: dict[str, str] = {}
    causes: dict[str, str] = {}

    for record in records:
        pipeline = record.pipeline or "Unknown"
        counts[pipeline] = counts.get(pipeline, 0) + 1
        if pipeline not in last_seen or record.createdAt > last_seen[pipeline]:
            last_seen[pipeline] = record.createdAt
            causes[pipeline] = record.title

    out: List[RepeatIncident] = []
    for pipeline, count in sorted(counts.items(), key=lambda item: item[1], reverse=True)[:top_n]:
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
