from typing import List

from fastapi import APIRouter

from ..models.overview import (
    ActiveIncident,
    DomainHealth,
    FailedJob,
    HealthDistribution,
    JobStatusPoint,
    OverviewKpis,
)
from ..services import glue_service, incidents_service

router = APIRouter(prefix="/overview", tags=["overview"])


@router.get("/kpis", response_model=OverviewKpis)
def kpis() -> OverviewKpis:
    jobs = glue_service.list_jobs()
    live = glue_service.live_status()
    failed_recent = glue_service.recent_failed_jobs(limit=100)
    inc_summary = incidents_service.summary()
    total = len(jobs)
    failed = live.failed + live.timedOut
    degraded = live.delayed + live.waitingUpstream
    healthy = max(0, total - failed - degraded)
    sla_compliance = round((healthy / total) * 100, 1) if total else 100.0
    return OverviewKpis(
        totalPipelines=total,
        healthy=healthy,
        degraded=degraded,
        failed=failed,
        failedJobs24h=len(failed_recent),
        activeP1=inc_summary.p1,
        activeP2=inc_summary.p2,
        slaBreaches=live.delayed,
        avgMtta=0.0,
        avgMttr=0.0,
        topImpactedDomain="—",
        slaCompliancePercent=sla_compliance,
    )


@router.get("/health-distribution", response_model=HealthDistribution)
def health_distribution() -> HealthDistribution:
    runs = glue_service.recent_runs()
    by_domain: dict = {}
    for r in runs:
        bucket = by_domain.setdefault(r.domain, {"healthy": 0, "degraded": 0, "failed": 0})
        if r.status == "Success":
            bucket["healthy"] += 1
        elif r.status in ("Failed", "Timed Out"):
            bucket["failed"] += 1
        else:
            bucket["degraded"] += 1
    return HealthDistribution(
        domains=[DomainHealth(name=k, **v) for k, v in by_domain.items()]
    )


@router.get("/job-status-trend", response_model=List[JobStatusPoint])
def job_status_trend() -> List[JobStatusPoint]:
    return glue_service.hourly_status_trend()


@router.get("/failed-jobs", response_model=List[FailedJob])
def failed_jobs() -> List[FailedJob]:
    return glue_service.recent_failed_jobs()


@router.get("/active-incidents", response_model=List[ActiveIncident])
def active_incidents() -> List[ActiveIncident]:
    records = incidents_service.list_records()
    return [
        ActiveIncident(
            id=r.id,
            title=r.title,
            severity=r.severity,
            status=r.status,
            pipeline=r.pipeline,
            domain=r.domain,
            createdAt=r.createdAt,
            owner=r.owner,
            acknowledged=r.status not in ("Open", "Investigating"),
            escalationLevel=0,
            age=r.age,
        )
        for r in records
    ]
