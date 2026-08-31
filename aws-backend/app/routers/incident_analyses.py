"""Incident-analysis endpoints — LLM-generated RCA + key findings per incident."""
from fastapi import APIRouter, Query

from ..services import incident_analysis_service

router = APIRouter(prefix="/incident-analyses", tags=["incident-analyses"])


@router.get("")
def list_incident_analyses(
    incident_ids: str = Query(
        default="",
        description="Comma-separated incident ids (ticket keys) to look up; empty = all.",
    ),
) -> dict:
    """Return analyses keyed by incident id: ``{analyses: {incident_id: {...}}}``."""
    ids = [x.strip() for x in incident_ids.split(",") if x.strip()] if incident_ids else None
    return {"analyses": incident_analysis_service.get_analyses(ids)}
