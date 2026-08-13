"""In-process MCP servers for incident/ticketing backends.

Each module here is a standalone MCP server (stdio transport) that the FastAPI
backend spawns as a subprocess via ``app.services.mcp_client``. The server the
backend talks to is chosen at runtime by ``INCIDENT_PROVIDER`` (jira | servicenow).

Every server exposes the same two tools with the same normalized shapes so the
provider is interchangeable:

    list_incidents(project: str | None, days: int) -> list[Incident]
    create_incident(summary, description, priority, issue_type) -> {"id", "url"}

where an ``Incident`` is::

    {
      "id":        str,          # ticket key / number  (e.g. "SCRUM-42", "INC0010001")
      "title":     str,
      "severity":  str,          # "P1" | "P2" | "P3" | "P4"
      "status":    str,          # "Open" | "Investigating" | "Mitigating" | "Resolved"
      "pipeline":  str,
      "domain":    str,
      "owner":     str,
      "createdAt": str,          # ISO-8601
      "resolvedAt": str | None,  # ISO-8601 or null
    }
"""
