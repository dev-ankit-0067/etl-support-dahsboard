"""Ticket-mapping endpoints — log id → incident ticket link."""
from fastapi import APIRouter, Query

from ..services import ticket_mapping_service

router = APIRouter(prefix="/ticket-mappings", tags=["ticket-mappings"])


@router.get("")
def list_ticket_mappings(
    log_ids: str = Query(
        default="",
        description="Comma-separated log identifiers to look up; empty = all mappings.",
    ),
) -> dict:
    """Return the latest ticket mapping per log id: ``{mappings: {log_id: {...}}}``."""
    ids = [x.strip() for x in log_ids.split(",") if x.strip()] if log_ids else None
    return {"mappings": ticket_mapping_service.get_mappings(ids)}
