from typing import Optional

from pydantic import BaseModel


class LiveStatus(BaseModel):
    running: int
    failed: int
    timedOut: int
    delayed: int
    waitingUpstream: int


class PipelineRun(BaseModel):
    id: str
    pipelineName: str
    status: str
    startTime: str
    endTime: str
    duration: str
    owner: str
    environment: str
    domain: str
    costPerRun: float


class PipelineHistoryItem(BaseModel):
    id: str
    status: str
    startTime: str
    durationMin: float
    cost: float
    recordsProcessed: int
    errorMessage: Optional[str] = None
