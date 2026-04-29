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
    from ..services import jira_service
except ImportError:
    jira_service = None  # type: ignore

log = logging.getLogger(__name__)

router = APIRouter(prefix="/incidents", tags=["incidents"])


@router.get("/summary", response_model=IncidentSummary)
def summary() -> IncidentSummary:
    if jira_service is None:
        raise HTTPException(status_code=500, detail="Jira service not available")
    try:
        return jira_service.summary()
    except Exception as exc:
        log.error("Jira summary failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Jira error: {str(exc)}")


@router.get("/mttr-trend", response_model=List[MttrTrendPoint])
def mttr_trend() -> List[MttrTrendPoint]:
    log.info("MTTR trend not available, returning empty data")
    return []


@router.get("/distribution", response_model=List[IncidentDistributionItem])
def distribution() -> List[IncidentDistributionItem]:
    log.info("Distribution not available, returning empty data")
    return []


@router.get("/list", response_model=List[IncidentRecord])
def listing() -> List[IncidentRecord]:
    if jira_service is None:
        raise HTTPException(status_code=500, detail="Jira service not available")
    try:
        return jira_service.list_records()
    except Exception as exc:
        log.error("Jira list_records failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Jira error: {str(exc)}")
