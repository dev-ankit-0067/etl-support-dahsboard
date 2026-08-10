from typing import List

from fastapi import APIRouter

from ..models.pipelines import PipelineHistoryItem, PipelineRun
from ..services import emr_serverless_service

router = APIRouter(prefix="/emr-serverless", tags=["emr-serverless"])


@router.get("/runs", response_model=List[PipelineRun])
def runs() -> List[PipelineRun]:
    return emr_serverless_service.recent_runs()


@router.get("/history/{application}", response_model=List[PipelineHistoryItem])
def history(application: str) -> List[PipelineHistoryItem]:
    return emr_serverless_service.history_for(application)
