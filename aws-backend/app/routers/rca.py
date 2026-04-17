from typing import List

from fastapi import APIRouter

from ..models.rca import RcaLifecycle, RepeatIncident
from ..services import rca_service

router = APIRouter(prefix="/rca", tags=["rca"])


@router.get("/lifecycle", response_model=RcaLifecycle)
def lifecycle() -> RcaLifecycle:
    return rca_service.lifecycle()


@router.get("/repeat-incidents", response_model=List[RepeatIncident])
def repeat_incidents() -> List[RepeatIncident]:
    return rca_service.repeat_incidents()
