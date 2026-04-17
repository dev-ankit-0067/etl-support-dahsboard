"""AWS Glue-backed pipeline (job) data."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

from botocore.exceptions import BotoCoreError, ClientError

from ..aws import client
from ..cache import cached
from ..config import get_settings
from ..models.overview import FailedJob, JobStatusPoint
from ..models.pipelines import LiveStatus, PipelineHistoryItem, PipelineRun

log = logging.getLogger(__name__)

# Glue job-run state mapping
_RUN_STATUS_MAP = {
    "STARTING": "Running",
    "RUNNING": "Running",
    "STOPPING": "Running",
    "SUCCEEDED": "Success",
    "FAILED": "Failed",
    "TIMEOUT": "Timed Out",
    "STOPPED": "Failed",
    "WAITING": "Waiting",
}

# Approximate Glue DPU pricing (us-east-1, standard worker). Override via env if needed.
_GLUE_DPU_HOUR_USD = 0.44


def _fmt_duration(seconds: float) -> str:
    if seconds <= 0:
        return "—"
    minutes, sec = divmod(int(seconds), 60)
    hours, minutes = divmod(minutes, 60)
    if hours:
        return f"{hours}h {minutes:02d}m"
    return f"{minutes}m {sec:02d}s"


def _iso(dt: Optional[datetime]) -> str:
    return dt.astimezone(timezone.utc).isoformat() if dt else ""


def _domain_from_name(name: str) -> str:
    prefix = name.split("_", 1)[0].lower() if "_" in name else name[:3].lower()
    mapping = {
        "fin": "Finance",
        "mkt": "Marketing",
        "sales": "Sales",
        "ops": "Operations",
        "hr": "HR",
        "sc": "Supply Chain",
        "cust": "Customer",
    }
    return mapping.get(prefix, "Other")


def _cost_per_run(run: dict) -> float:
    dpu_seconds = run.get("DPUSeconds") or (
        run.get("MaxCapacity", 0) * (run.get("ExecutionTime", 0) or 0)
    )
    return round((dpu_seconds / 3600.0) * _GLUE_DPU_HOUR_USD, 2)


@cached("medium")
def list_jobs() -> List[dict]:
    glue = client("glue")
    jobs: List[dict] = []
    paginator = glue.get_paginator("get_jobs")
    settings = get_settings()
    name_filter = (settings.glue_job_name_filter or "").lower()
    try:
        for page in paginator.paginate():
            for job in page.get("Jobs", []):
                if name_filter and name_filter not in job["Name"].lower():
                    continue
                jobs.append(job)
    except (BotoCoreError, ClientError) as exc:
        log.error("Glue list_jobs failed: %s", exc)
        raise
    return jobs


@cached("short")
def list_recent_runs(max_per_job: int = 5) -> List[dict]:
    """Return recent Glue job runs across all jobs (flattened)."""
    glue = client("glue")
    runs: List[dict] = []
    for job in list_jobs():
        try:
            resp = glue.get_job_runs(JobName=job["Name"], MaxResults=max_per_job)
        except (BotoCoreError, ClientError) as exc:
            log.warning("get_job_runs failed for %s: %s", job["Name"], exc)
            continue
        for r in resp.get("JobRuns", []):
            r["_jobName"] = job["Name"]
            runs.append(r)
    return runs


@cached("short")
def live_status() -> LiveStatus:
    runs = list_recent_runs(max_per_job=1)
    counts = {"running": 0, "failed": 0, "timedOut": 0, "delayed": 0, "waitingUpstream": 0}
    sla_threshold = timedelta(minutes=get_settings().sla_breach_minutes)
    now = datetime.now(timezone.utc)
    for r in runs:
        state = r.get("JobRunState", "")
        if state in ("STARTING", "RUNNING", "STOPPING"):
            counts["running"] += 1
            started = r.get("StartedOn")
            if started and now - started > sla_threshold:
                counts["delayed"] += 1
        elif state == "FAILED":
            counts["failed"] += 1
        elif state == "TIMEOUT":
            counts["timedOut"] += 1
        elif state == "WAITING":
            counts["waitingUpstream"] += 1
    return LiveStatus(**counts)


@cached("short")
def recent_runs() -> List[PipelineRun]:
    out: List[PipelineRun] = []
    for r in list_recent_runs(max_per_job=2):
        name = r["_jobName"]
        started = r.get("StartedOn")
        completed = r.get("CompletedOn")
        duration_s = (r.get("ExecutionTime") or 0)
        status = _RUN_STATUS_MAP.get(r.get("JobRunState", ""), "Waiting")
        out.append(
            PipelineRun(
                id=r.get("Id", ""),
                pipelineName=name,
                status=status,
                startTime=_iso(started),
                endTime=_iso(completed),
                duration=_fmt_duration(duration_s),
                owner=r.get("WorkerType", "—"),
                environment="Prod",
                domain=_domain_from_name(name),
                costPerRun=_cost_per_run(r),
            )
        )
    return out


@cached("medium")
def history_for(job_name: str, limit: int = 20) -> List[PipelineHistoryItem]:
    glue = client("glue")
    try:
        resp = glue.get_job_runs(JobName=job_name, MaxResults=limit)
    except (BotoCoreError, ClientError) as exc:
        log.error("history_for(%s) failed: %s", job_name, exc)
        raise
    items: List[PipelineHistoryItem] = []
    for r in resp.get("JobRuns", []):
        items.append(
            PipelineHistoryItem(
                id=r.get("Id", ""),
                status=_RUN_STATUS_MAP.get(r.get("JobRunState", ""), "Waiting"),
                startTime=_iso(r.get("StartedOn")),
                durationMin=round((r.get("ExecutionTime") or 0) / 60.0, 2),
                cost=_cost_per_run(r),
                recordsProcessed=int(
                    (r.get("Arguments", {}) or {}).get("--records_processed", 0) or 0
                ),
                errorMessage=r.get("ErrorMessage"),
            )
        )
    return items


@cached("medium")
def hourly_status_trend(hours: int = 24) -> List[JobStatusPoint]:
    """Bucket job runs into hourly windows (success/failed/running)."""
    now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    buckets: Dict[str, Dict[str, int]] = {}
    for i in range(hours):
        ts = (now - timedelta(hours=hours - 1 - i)).strftime("%Y-%m-%dT%H:00")
        buckets[ts] = {"success": 0, "failed": 0, "running": 0}
    cutoff = now - timedelta(hours=hours)
    for r in list_recent_runs(max_per_job=20):
        started = r.get("StartedOn")
        if not started or started < cutoff:
            continue
        bucket = started.replace(minute=0, second=0, microsecond=0).strftime(
            "%Y-%m-%dT%H:00"
        )
        if bucket not in buckets:
            continue
        state = r.get("JobRunState", "")
        if state == "SUCCEEDED":
            buckets[bucket]["success"] += 1
        elif state in ("FAILED", "TIMEOUT", "STOPPED"):
            buckets[bucket]["failed"] += 1
        elif state in ("STARTING", "RUNNING", "STOPPING"):
            buckets[bucket]["running"] += 1
    return [JobStatusPoint(timestamp=ts, **vals) for ts, vals in buckets.items()]


@cached("medium")
def recent_failed_jobs(limit: int = 10) -> List[FailedJob]:
    out: List[FailedJob] = []
    for r in sorted(
        list_recent_runs(max_per_job=5),
        key=lambda x: x.get("CompletedOn") or x.get("StartedOn") or datetime.min.replace(tzinfo=timezone.utc),
        reverse=True,
    ):
        if r.get("JobRunState") not in ("FAILED", "TIMEOUT"):
            continue
        name = r["_jobName"]
        out.append(
            FailedJob(
                id=r.get("Id", ""),
                pipelineName=name,
                domain=_domain_from_name(name),
                failedAt=_iso(r.get("CompletedOn") or r.get("StartedOn")),
                duration=_fmt_duration(r.get("ExecutionTime") or 0),
                errorType=(r.get("ErrorMessage") or "Unknown").split(":", 1)[0][:64],
                owner=r.get("WorkerType", "—"),
                severity="P1" if r.get("JobRunState") == "TIMEOUT" else "P2",
            )
        )
        if len(out) >= limit:
            break
    return out
