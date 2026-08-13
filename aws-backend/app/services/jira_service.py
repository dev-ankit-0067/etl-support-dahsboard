"""Backward-compatibility shim.

Jira is now accessed through the provider-agnostic MCP layer:
  * incident/RCA aggregation lives in ``app.services.incidents_service``
  * the Jira SDK access lives in the MCP server ``app.mcp_servers.jira_server``
    (spawned over stdio; see ``app.services.mcp_client``)

This module remains only so older imports keep working. Prefer importing
``incidents_service`` (provider-agnostic) in new code.
"""
from __future__ import annotations

from .incidents_service import (  # noqa: F401
    create_ticket,
    list_records,
    rca_lifecycle,
    rca_repeat_incidents,
    summary,
)

# Legacy import target for app.services.agent (unmounted): the Jira client now
# lives in the MCP server module.
from ..mcp_servers.jira_server import JiraClient  # noqa: F401
