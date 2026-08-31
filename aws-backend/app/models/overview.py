from typing import List

from pydantic import BaseModel


class OverviewKpis(BaseModel):
    totalPipelines: int
    healthy: int
    degraded: int
    failed: int
    failedJobs24h: int
    activeP1: int
    activeP2: int
    slaBreaches: int
    slaCompliancePercent: float


class JobStatusPoint(BaseModel):
    timestamp: str
    success: int
    failed: int
    running: int


class FailedJob(BaseModel):
    id: str
    pipelineName: str
    failedAt: str
    duration: str
    errorType: str
    severity: str


class ActiveIncident(BaseModel):
    id: str
    title: str
    severity: str
    status: str
    pipeline: str
    domain: str
    createdAt: str
    owner: str
    acknowledged: bool
    escalationLevel: int
    age: str
