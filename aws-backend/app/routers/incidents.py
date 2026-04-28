import logging
from typing import List

from fastapi import APIRouter, HTTPException

from ..config import get_settings
from ..models.incidents import (
    IncidentDistributionItem,
    IncidentRecord,
    IncidentSummary,
    MttrTrendPoint,
)
from ..services import incidents_service

try:
    from ..services import jira_service
except ImportError:
    jira_service = None  # type: ignore

log = logging.getLogger(__name__)

router = APIRouter(prefix="/incidents", tags=["incidents"])


@router.get("/summary", response_model=IncidentSummary)
def summary() -> IncidentSummary:
    settings = get_settings()
    
    if settings.use_jira_incidents:
        if jira_service is None:
            raise HTTPException(status_code=500, detail="Jira service not available")
        try:
            return jira_service.summary()
        except Exception as exc:
            log.error("Jira summary failed: %s", exc)
            raise HTTPException(status_code=500, detail=f"Jira error: {str(exc)}")
    
    return incidents_service.summary()


@router.get("/mttr-trend", response_model=List[MttrTrendPoint])
def mttr_trend() -> List[MttrTrendPoint]:
    settings = get_settings()
    
    if settings.use_jira_incidents:
        log.info("MTTR trend not available for Jira incidents, returning empty data")
        # Return empty list instead of error to prevent frontend breakage
        return []
    
    return incidents_service.mttr_trend()


@router.get("/distribution", response_model=List[IncidentDistributionItem])
def distribution() -> List[IncidentDistributionItem]:
    settings = get_settings()
    
    if settings.use_jira_incidents:
        log.info("Distribution not available for Jira incidents, returning empty data")
        # Return empty list instead of error to prevent frontend breakage
        return []
    
    return incidents_service.distribution()


@router.get("/list", response_model=List[IncidentRecord])
def listing() -> List[IncidentRecord]:
    settings = get_settings()
    
    if settings.use_jira_incidents:
        if jira_service is None:
            raise HTTPException(status_code=500, detail="Jira service not available")
        try:
            return jira_service.list_records()
        except Exception as exc:
            log.error("Jira list_records failed: %s", exc)
            raise HTTPException(status_code=500, detail=f"Jira error: {str(exc)}")
    
    return incidents_service.list_records()
