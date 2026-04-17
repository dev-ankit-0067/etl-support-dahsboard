from typing import List

from fastapi import APIRouter

from ..models.incidents import (
    IncidentDistributionItem,
    IncidentRecord,
    IncidentSummary,
    MttrTrendPoint,
)
from ..services import incidents_service

router = APIRouter(prefix="/incidents", tags=["incidents"])


@router.get("/summary", response_model=IncidentSummary)
def summary() -> IncidentSummary:
    return incidents_service.summary()


@router.get("/mttr-trend", response_model=List[MttrTrendPoint])
def mttr_trend() -> List[MttrTrendPoint]:
    return incidents_service.mttr_trend()


@router.get("/distribution", response_model=List[IncidentDistributionItem])
def distribution() -> List[IncidentDistributionItem]:
    return incidents_service.distribution()


@router.get("/list", response_model=List[IncidentRecord])
def listing() -> List[IncidentRecord]:
    return incidents_service.list_records()
