import logging
from typing import List

from fastapi import APIRouter, HTTPException

from ..models.incidents import (
    IncidentDistributionItem,
    IncidentRecord,
    IncidentSummary,
    MttrTrendPoint,
)

try:
    from ..services import incidents_service
except ImportError:
    incidents_service = None  # type: ignore

log = logging.getLogger(__name__)

router = APIRouter(prefix="/incidents", tags=["incidents"])


@router.get("/summary", response_model=IncidentSummary)
def summary() -> IncidentSummary:
    if incidents_service is None:
        raise HTTPException(status_code=500, detail="Incident service not available")
    try:
        return incidents_service.summary()
    except Exception as exc:
        log.error("Incident summary failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Incident provider error: {str(exc)}")


@router.get("/mttr-trend", response_model=List[MttrTrendPoint])
def mttr_trend() -> List[MttrTrendPoint]:
    log.info("MTTR trend not available, returning empty data")
    return []


@router.get("/distribution", response_model=List[IncidentDistributionItem])
def distribution() -> List[IncidentDistributionItem]:
    log.info("Distribution not available, returning empty data")
    return []


@router.get("/{incident_id}/timeline")
def timeline(incident_id: str) -> List[dict]:
    """Status-change history for a single incident (Jira changelog / ServiceNow audit)."""
    if incidents_service is None:
        raise HTTPException(status_code=500, detail="Incident service not available")
    try:
        return incidents_service.get_timeline(incident_id)
    except Exception as exc:
        log.error("Incident timeline failed for %s: %s", incident_id, exc)
        raise HTTPException(status_code=500, detail=f"Incident provider error: {str(exc)}")


@router.get("/list", response_model=List[IncidentRecord])
def listing() -> List[IncidentRecord]:
    if incidents_service is None:
        raise HTTPException(status_code=500, detail="Incident service not available")
    try:
        return incidents_service.list_records()
    except Exception as exc:
        log.error("Incident list_records failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Incident provider error: {str(exc)}")
