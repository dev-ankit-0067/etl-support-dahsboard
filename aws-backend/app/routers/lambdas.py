from typing import List

from fastapi import APIRouter

from ..models.lambdas import LambdaInvocation, LambdaKpis
from ..services import lambda_service

router = APIRouter(prefix="/lambdas", tags=["lambdas"])


@router.get("/kpis", response_model=LambdaKpis)
def kpis() -> LambdaKpis:
    return lambda_service.kpis()


@router.get("/runs", response_model=List[LambdaInvocation])
def runs() -> List[LambdaInvocation]:
    return lambda_service.recent_invocations()
