"""MCP server exposing ServiceNow (Table API) as an incident/ticketing backend.

Run standalone over stdio:  python -m app.mcp_servers.servicenow_server
Spawned by app.services.mcp_client when INCIDENT_PROVIDER=servicenow.

Talks to ServiceNow's REST Table API (/api/now/table/<table>) using basic auth,
and maps the `incident` table onto the same normalized incident shape the Jira
server produces, so the two providers are interchangeable.
"""
# NOTE: no `from __future__ import annotations` here — FastMCP introspects the
# tool signatures at runtime and needs real annotation objects, not strings.
import logging
from datetime import datetime, timezone
from typing import Any, List, Optional

import requests
from mcp.server.fastmcp import FastMCP

from ..config import get_settings

log = logging.getLogger(__name__)

mcp = FastMCP("opsguardian-servicenow")

# Fields we request from ServiceNow (raw value + display value via display_value=all).
_FIELDS = (
    "number,short_description,priority,state,assigned_to,sys_created_on,"
    "resolved_at,closed_at,business_service,cmdb_ci,category,assignment_group"
)

# Jira-style priority names / severities -> ServiceNow numeric priority.
_PRIORITY_TO_SNOW = {
    "highest": "1", "p1": "1",
    "high": "2", "p2": "2",
    "medium": "3", "p3": "3",
    "low": "4", "p4": "4",
    "planning": "5", "p5": "5",
}


def _base_url() -> str:
    settings = get_settings()
    if not settings.servicenow_instance:
        raise ValueError("ServiceNow not configured (set SERVICENOW_INSTANCE, SERVICENOW_USER, SERVICENOW_PASSWORD)")
    return settings.servicenow_instance.rstrip("/")


def _auth():
    settings = get_settings()
    if not settings.servicenow_user or not settings.servicenow_password:
        raise ValueError("ServiceNow credentials not configured (SERVICENOW_USER, SERVICENOW_PASSWORD)")
    return (settings.servicenow_user, settings.servicenow_password)


def _field(record: dict, name: str) -> tuple[str, str]:
    """Return (value, display_value) for a field returned with display_value=all."""
    v = record.get(name)
    if isinstance(v, dict):
        return str(v.get("value") or ""), str(v.get("display_value") or "")
    s = "" if v is None else str(v)
    return s, s


def _iso(value: Optional[str]) -> Optional[str]:
    """ServiceNow returns 'YYYY-MM-DD HH:MM:SS' (UTC) -> ISO-8601, or None."""
    if not value:
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S"):
        try:
            return datetime.strptime(value, fmt).replace(tzinfo=timezone.utc).isoformat()
        except ValueError:
            continue
    return value


@mcp.tool()
def list_incidents(project: Optional[str] = None, days: int = 30) -> List[dict]:
    """List incidents from the ServiceNow incident table as normalized records.

    Args:
        project: Optional project value; matched against the configured project field.
        days: Look-back window (filters on sys_created_on).
    """
    settings = get_settings()
    table = settings.servicenow_table

    clauses = [f"sys_created_on>=javascript:gs.daysAgoStart({int(days)})"]
    if project and settings.servicenow_project_field:
        clauses.append(f"{settings.servicenow_project_field}={project}")
    clauses.append("ORDERBYDESCsys_created_on")
    query = "^".join(clauses)

    resp = requests.get(
        f"{_base_url()}/api/now/table/{table}",
        params={
            "sysparm_query": query,
            "sysparm_fields": _FIELDS,
            "sysparm_display_value": "all",
            "sysparm_exclude_reference_link": "true",
            "sysparm_limit": "200",
        },
        auth=_auth(),
        headers={"Accept": "application/json"},
        timeout=30,
    )
    resp.raise_for_status()
    records = resp.json().get("result", [])

    pri_map = settings.servicenow_priority_mapping
    state_map = settings.servicenow_status_mapping

    out: List[dict] = []
    for rec in records:
        try:
            number, _ = _field(rec, "number")
            title, _ = _field(rec, "short_description")
            pri_val, _ = _field(rec, "priority")
            state_val, _ = _field(rec, "state")
            _, owner_disp = _field(rec, "assigned_to")
            created_val, _ = _field(rec, "sys_created_on")
            resolved_val, _ = _field(rec, "resolved_at")
            closed_val, _ = _field(rec, "closed_at")
            _, svc_disp = _field(rec, "business_service")
            _, ci_disp = _field(rec, "cmdb_ci")
            _, cat_disp = _field(rec, "category")
            _, group_disp = _field(rec, "assignment_group")

            status = state_map.get(state_val, "Open")
            out.append(
                {
                    "id": number,
                    "title": title,
                    "severity": pri_map.get(pri_val, "P3"),
                    "status": status,
                    "pipeline": svc_disp or ci_disp or cat_disp or "Unknown",
                    "domain": cat_disp or group_disp or "ServiceNow",
                    "owner": owner_disp or "Unassigned",
                    "createdAt": _iso(created_val),
                    "resolvedAt": _iso(resolved_val or closed_val) if status == "Resolved" else None,
                }
            )
        except Exception as exc:  # noqa: BLE001 - skip malformed rows, keep the rest
            log.warning("Error converting ServiceNow record: %s", exc)
            continue

    log.info("Fetched %d incidents from ServiceNow table %s", len(out), table)
    return out


@mcp.tool()
def create_incident(
    summary: str,
    description: str,
    priority: str = "Medium",
    issue_type: Optional[str] = None,  # accepted for interface parity; unused for ServiceNow
    project: Optional[str] = None,
) -> dict:
    """Create a ServiceNow incident and return its number/url.

    Args:
        summary: Short one-line title (becomes short_description).
        description: Full incident description.
        priority: Priority as a Jira-style name or Pn (mapped to ServiceNow 1-5).
        issue_type: Ignored (present for cross-provider tool parity).
        project: Optional project tag value written to the configured
            SERVICENOW_PROJECT_FIELD so the ticket surfaces under that filter.
    """
    settings = get_settings()
    table = settings.servicenow_table
    snow_priority = _PRIORITY_TO_SNOW.get((priority or "").strip().lower(), settings.servicenow_issue_priority_default)

    payload = {
        "short_description": summary,
        "description": description,
        "priority": snow_priority,
    }
    if project and settings.servicenow_project_field:
        payload[settings.servicenow_project_field] = project

    resp = requests.post(
        f"{_base_url()}/api/now/table/{table}",
        params={"sysparm_fields": "number,sys_id", "sysparm_display_value": "false"},
        json=payload,
        auth=_auth(),
        headers={"Accept": "application/json", "Content-Type": "application/json"},
        timeout=30,
    )
    resp.raise_for_status()
    result: dict[str, Any] = resp.json().get("result", {})
    number = result.get("number")
    sys_id = result.get("sys_id")
    log.info("Created ServiceNow incident: %s", number)
    url = f"{_base_url()}/nav_to.do?uri=/{table}.do?sys_id={sys_id}" if sys_id else None
    return {"id": number, "url": url}


if __name__ == "__main__":
    mcp.run()
