from fastapi import APIRouter

from ..models.costs import CostBreakdown, CostKpis, CostPerformance
from ..services import costs_service

router = APIRouter(prefix="/costs", tags=["costs"])


@router.get("/kpis", response_model=CostKpis)
def kpis() -> CostKpis:
    return costs_service.kpis()


@router.get("/breakdown", response_model=CostBreakdown)
def breakdown() -> CostBreakdown:
    return costs_service.breakdown()


@router.get("/performance", response_model=CostPerformance)
def performance() -> CostPerformance:
    return costs_service.performance()
