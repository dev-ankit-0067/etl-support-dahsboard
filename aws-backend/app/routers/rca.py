import logging
from typing import List

from fastapi import APIRouter, HTTPException

from ..models.rca import RcaLifecycle, RepeatIncident

try:
    from ..services import jira_service
except ImportError:
    jira_service = None  # type: ignore

log = logging.getLogger(__name__)

router = APIRouter(prefix="/rca", tags=["rca"])


@router.get("/lifecycle", response_model=RcaLifecycle)
def lifecycle() -> RcaLifecycle:
    if jira_service is None:
        raise HTTPException(status_code=500, detail="Jira service not available")

    try:
        return jira_service.rca_lifecycle()
    except Exception as exc:
        log.error("RCA lifecycle failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Jira error: {str(exc)}")


@router.get("/repeat-incidents", response_model=List[RepeatIncident])
def repeat_incidents() -> List[RepeatIncident]:
    if jira_service is None:
        raise HTTPException(status_code=500, detail="Jira service not available")

    try:
        return jira_service.rca_repeat_incidents()
    except Exception as exc:
        log.error("RCA repeat_incidents failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Jira error: {str(exc)}")
