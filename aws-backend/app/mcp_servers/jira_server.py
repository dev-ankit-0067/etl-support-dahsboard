"""MCP server exposing Jira as an incident/ticketing backend.

Run standalone over stdio:  python -m app.mcp_servers.jira_server
Spawned by app.services.mcp_client when INCIDENT_PROVIDER=jira.

All Jira SDK access lives here (out of the FastAPI process); the backend talks
to it only through the two MCP tools below.
"""
# NOTE: no `from __future__ import annotations` here — FastMCP introspects the
# tool signatures at runtime and needs real annotation objects, not strings.
import logging
from datetime import datetime, timezone
from typing import List, Optional

from jira import JIRA
from jira.exceptions import JIRAError
from mcp.server.fastmcp import FastMCP

from ..config import get_settings

log = logging.getLogger(__name__)

mcp = FastMCP("opsguardian-jira")


class JiraClient:
    """Singleton Jira client wrapper."""

    _instance: Optional[JIRA] = None

    @classmethod
    def get_client(cls) -> JIRA:
        if cls._instance is None:
            settings = get_settings()
            if not settings.jira_url or not settings.jira_username or not settings.jira_api_token:
                raise ValueError("Jira credentials not configured (jira_url, jira_username, jira_api_token)")
            try:
                cls._instance = JIRA(
                    server=settings.jira_url,
                    basic_auth=(settings.jira_username, settings.jira_api_token),
                    options={"verify": True},
                )
                log.info("Connected to Jira: %s", settings.jira_url)
            except JIRAError as exc:
                log.error("Failed to connect to Jira: %s", exc)
                raise
        return cls._instance


def _map_priority_to_severity(priority: Optional[object]) -> str:
    settings = get_settings()
    if not priority:
        return "P3"
    priority_name = priority.name if hasattr(priority, "name") else str(priority)
    if not priority_name:
        return "P3"
    return settings.jira_priority_mapping.get(priority_name, "P3")


def _map_status_to_incident_status(jira_status: Optional[str]) -> str:
    settings = get_settings()
    if not jira_status:
        return "Open"
    return settings.jira_status_mapping.get(jira_status, "Open")


def _iso(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).isoformat()
    except (ValueError, AttributeError, TypeError):
        return value


@mcp.tool()
def list_incidents(project: Optional[str] = None, days: int = 30) -> List[dict]:
    """List incidents from the configured Jira project as normalized records.

    Args:
        project: Optional project value; matched against a Jira label to scope results.
        days: Look-back window hint (Jira returns the newest issues in the project).
    """
    settings = get_settings()
    client = JiraClient.get_client()

    label_clause = f' AND labels = "{project}"' if project else ""
    jql = f"project = {settings.jira_project_key}{label_clause} ORDER BY created DESC"

    try:
        issues = client.search_issues(jql, maxResults=False)
    except JIRAError as exc:
        log.error("Failed to fetch Jira issues: %s", exc)
        raise

    out: List[dict] = []
    for issue in issues:
        try:
            f = issue.fields
            owner = f.assignee.displayName if f.assignee else "Unassigned"
            out.append(
                {
                    "id": issue.key,
                    "title": f.summary,
                    "severity": _map_priority_to_severity(f.priority),
                    "status": _map_status_to_incident_status(f.status.name if f.status else None),
                    "pipeline": f.project.name,
                    "domain": (f.assignee.displayName if f.assignee else f.issuetype.name),
                    "owner": owner,
                    "createdAt": _iso(f.created),
                    "resolvedAt": _iso(getattr(f, "resolutiondate", None) or (f.updated if _map_status_to_incident_status(f.status.name if f.status else None) == "Resolved" else None)),
                }
            )
        except Exception as exc:  # noqa: BLE001 - skip malformed issues, keep the rest
            log.warning("Error converting issue %s: %s", getattr(issue, "key", "?"), exc)
            continue

    log.info("Fetched %d issues from Jira project %s", len(out), settings.jira_project_key)
    return out


@mcp.tool()
def create_incident(
    summary: str,
    description: str,
    priority: str = "Medium",
    issue_type: Optional[str] = None,
    project: Optional[str] = None,
) -> dict:
    """Create a Jira issue and return its key/url.

    Args:
        summary: Short one-line title.
        description: Full incident description.
        priority: Jira priority name (Highest, High, Medium, Low).
        issue_type: Jira issue type; defaults to the configured type.
        project: Optional project tag value applied as an issue label so the
            ticket surfaces under that project's filter.
    """
    settings = get_settings()
    client = JiraClient.get_client()
    resolved_type = issue_type or settings.jira_issue_type

    create_kwargs: dict = {
        "project": settings.jira_project_key,
        "summary": summary,
        "description": description,
        "issuetype": {"name": resolved_type},
        "priority": {"name": priority},
    }
    if project:
        create_kwargs["labels"] = [project]

    try:
        issue = client.create_issue(**create_kwargs)
    except JIRAError as exc:
        log.error("Failed to create Jira issue: %s", exc)
        raise

    log.info("Created Jira issue: %s", issue.key)
    url = f"{settings.jira_url.rstrip('/')}/browse/{issue.key}" if settings.jira_url else None
    return {"id": issue.key, "url": url}


@mcp.tool()
def get_incident_timeline(incident_id: str) -> List[dict]:
    """Return the status-change history of an incident as normalized events.

    Args:
        incident_id: Jira issue key (e.g. SCRUM-108).
    """
    client = JiraClient.get_client()
    try:
        issue = client.issue(incident_id, expand="changelog")
    except JIRAError as exc:
        log.error("Failed to fetch Jira issue %s: %s", incident_id, exc)
        raise

    settings = get_settings()
    status_map = settings.jira_status_mapping

    def _status(name: Optional[str]) -> str:
        return status_map.get(name or "", "Open") if name else "Open"

    events: List[dict] = []
    initial = issue.fields.status.name if issue.fields.status else None
    events.append({"status": _status(initial), "timestamp": _iso(issue.fields.created)})

    try:
        histories = issue.changelog.histories if getattr(issue, "changelog", None) else []
        for h in histories:
            ts = _iso(h.created)
            for item in h.items or []:
                if getattr(item, "field", None) == "status" and getattr(item, "toString", None):
                    events.append({"status": _status(item.toString), "timestamp": ts})
    except Exception as exc:  # noqa: BLE001 - changelog is best-effort
        log.warning("Changelog unavailable for %s: %s", incident_id, exc)

    # Ascending by time, dedupe consecutive repeats, keep the creation event first.
    events.sort(key=lambda e: e.get("timestamp") or "")
    deduped: List[dict] = []
    for e in events:
        if not deduped or deduped[-1]["status"] != e["status"]:
            deduped.append(e)
    return deduped or [{"status": "Open", "timestamp": _iso(issue.fields.created)}]


if __name__ == "__main__":
    mcp.run()
