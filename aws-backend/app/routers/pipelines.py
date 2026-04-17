from typing import List

from fastapi import APIRouter

from ..models.pipelines import LiveStatus, PipelineHistoryItem, PipelineRun
from ..services import glue_service

router = APIRouter(prefix="/pipelines", tags=["pipelines"])


@router.get("/live", response_model=LiveStatus)
def live() -> LiveStatus:
    return glue_service.live_status()


@router.get("/runs", response_model=List[PipelineRun])
def runs() -> List[PipelineRun]:
    return glue_service.recent_runs()


@router.get("/history/{pipeline_name}", response_model=List[PipelineHistoryItem])
def history(pipeline_name: str) -> List[PipelineHistoryItem]:
    return glue_service.history_for(pipeline_name)
