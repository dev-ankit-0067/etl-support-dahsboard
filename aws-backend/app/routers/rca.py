import logging
from typing import List

from fastapi import APIRouter

from ..config import get_settings
from ..models.rca import RcaLifecycle, RepeatIncident, LifecycleStage
from ..services import rca_service

log = logging.getLogger(__name__)

router = APIRouter(prefix="/rca", tags=["rca"])


@router.get("/lifecycle", response_model=RcaLifecycle)
def lifecycle() -> RcaLifecycle:
    settings = get_settings()
    
    # RCA requires SSM Incident Manager - return empty data when using Jira or if SSM fails
    if settings.use_jira_incidents:
        log.info("RCA lifecycle not available when using Jira incidents")
        return RcaLifecycle(stages=[
            LifecycleStage(stage="Detect", avgMinutes=0),
            LifecycleStage(stage="Acknowledge", avgMinutes=0),
            LifecycleStage(stage="Mitigate", avgMinutes=0),
            LifecycleStage(stage="Resolve", avgMinutes=0),
            LifecycleStage(stage="RCA Published", avgMinutes=0),
        ])
    
    try:
        return rca_service.lifecycle()
    except Exception as exc:
        log.error("RCA lifecycle failed: %s", exc)
        # Return empty data instead of error
        return RcaLifecycle(stages=[
            LifecycleStage(stage="Detect", avgMinutes=0),
            LifecycleStage(stage="Acknowledge", avgMinutes=0),
            LifecycleStage(stage="Mitigate", avgMinutes=0),
            LifecycleStage(stage="Resolve", avgMinutes=0),
            LifecycleStage(stage="RCA Published", avgMinutes=0),
        ])


@router.get("/repeat-incidents", response_model=List[RepeatIncident])
def repeat_incidents() -> List[RepeatIncident]:
    settings = get_settings()
    
    # RCA requires SSM Incident Manager - return empty data when using Jira or if SSM fails
    if settings.use_jira_incidents:
        log.info("RCA repeat incidents not available when using Jira incidents")
        return []
    
    try:
        return rca_service.repeat_incidents()
    except Exception as exc:
        log.error("RCA repeat_incidents failed: %s", exc)
        # Return empty data instead of error
        return []
