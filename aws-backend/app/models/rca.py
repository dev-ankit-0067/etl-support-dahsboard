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


class KeyFindingsRequest(BaseModel):
    incident_id: str | None = None
    title: str | None = None
    description: str | None = None
    notes: List[str] | None = None


class KeyFindingsResponse(BaseModel):
    key_findings: List[str]
