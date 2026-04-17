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
    avgMtta: float
    avgMttr: float
    topImpactedDomain: str
    slaCompliancePercent: float


class DomainHealth(BaseModel):
    name: str
    healthy: int
    degraded: int
    failed: int


class HealthDistribution(BaseModel):
    domains: List[DomainHealth]


class JobStatusPoint(BaseModel):
    timestamp: str
    success: int
    failed: int
    running: int


class FailedJob(BaseModel):
    id: str
    pipelineName: str
    domain: str
    failedAt: str
    duration: str
    errorType: str
    owner: str
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
