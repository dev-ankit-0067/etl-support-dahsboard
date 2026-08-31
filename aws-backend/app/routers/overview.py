import logging
from typing import List

from fastapi import APIRouter

from ..config import get_settings
from ..models.overview import (
    ActiveIncident,
    FailedJob,
    JobStatusPoint,
    OverviewKpis,
)
from ..models.pipelines import LiveStatus
from ..services import glue_service

try:
    from ..services import incidents_service
except ImportError:
    incidents_service = None  # type: ignore

log = logging.getLogger(__name__)

router = APIRouter(prefix="/overview", tags=["overview"])


@router.get("/kpis", response_model=OverviewKpis)
def kpis() -> OverviewKpis:
    try:
        jobs = glue_service.list_jobs()
        live = glue_service.live_status()
        failed_recent = glue_service.recent_failed_jobs(limit=100)
    except Exception as exc:
        log.error("Glue service failed: %s", exc)
        # Return empty data if Glue fails
        jobs = []
        live = LiveStatus(running=0, failed=0, timedOut=0, delayed=0, waitingUpstream=0)
        failed_recent = []
    
    if incidents_service:
        try:
            inc_summary = incidents_service.summary()
        except Exception as exc:
            log.error("Incident summary failed: %s", exc)
            from ..models.incidents import IncidentSummary
            inc_summary = IncidentSummary(open=0, acknowledged=0, resolved24h=0, p1=0, p2=0, p3=0)
    else:
        from ..models.incidents import IncidentSummary
        inc_summary = IncidentSummary(open=0, acknowledged=0, resolved24h=0, p1=0, p2=0, p3=0)
    
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
        slaCompliancePercent=sla_compliance,
    )


@router.get("/job-status-trend", response_model=List[JobStatusPoint])
def job_status_trend() -> List[JobStatusPoint]:
    try:
        return glue_service.hourly_status_trend()
    except Exception as exc:
        log.error("Glue service hourly_status_trend failed: %s", exc)
        return []


@router.get("/failed-jobs", response_model=List[FailedJob])
def failed_jobs() -> List[FailedJob]:
    try:
        return glue_service.recent_failed_jobs()
    except Exception as exc:
        log.error("Glue service recent_failed_jobs failed: %s", exc)
        return []


@router.get("/active-incidents", response_model=List[ActiveIncident])
def active_incidents() -> List[ActiveIncident]:
    if incidents_service:
        try:
            records = incidents_service.list_records()
        except Exception as exc:
            log.error("Incident list_records failed: %s", exc)
            records = []
    else:
        records = []
    
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
