from typing import List

from fastapi import APIRouter

from ..models.pipelines import PipelineHistoryItem, PipelineRun
from ..services import emr_service

router = APIRouter(prefix="/emr", tags=["emr"])


@router.get("/runs", response_model=List[PipelineRun])
def runs() -> List[PipelineRun]:
    return emr_service.recent_runs()


@router.get("/history/{cluster}", response_model=List[PipelineHistoryItem])
def history(cluster: str) -> List[PipelineHistoryItem]:
    return emr_service.history_for(cluster)
