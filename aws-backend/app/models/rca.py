from typing import List

from pydantic import BaseModel


class LifecycleStage(BaseModel):
    stage: str
    avgMinutes: float


class RcaLifecycle(BaseModel):
    stages: List[LifecycleStage]


class RepeatIncident(BaseModel):
    pipeline: str
    occurrences: int
    lastSeen: str
    rootCause: str
