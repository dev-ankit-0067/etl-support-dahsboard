"""AWS EMR Serverless backed data: applications as rows, job runs as history."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import List, Optional

from botocore.exceptions import BotoCoreError, ClientError

from ..aws import client
from ..cache import cached
from ..models.pipelines import PipelineHistoryItem, PipelineRun
from . import tags_service

log = logging.getLogger(__name__)

_JOB_STATUS = {
    "SUBMITTED": "Running",
    "PENDING": "Running",
    "SCHEDULED": "Running",
    "QUEUED": "Waiting",
    "RUNNING": "Running",
    "SUCCESS": "Success",
    "FAILED": "Failed",
    "CANCELLING": "Running",
    "CANCELLED": "Failed",
}


def _iso(dt: Optional[datetime]) -> str:
    return dt.astimezone(timezone.utc).isoformat() if dt else ""


def _fmt_duration(start: Optional[datetime], end: Optional[datetime]) -> str:
    if not start:
        return "—"
    end = end or datetime.now(timezone.utc)
    seconds = int((end - start).total_seconds())
    if seconds <= 0:
        return "—"
    minutes, sec = divmod(seconds, 60)
    hours, minutes = divmod(minutes, 60)
    return f"{hours}h {minutes:02d}m" if hours else f"{minutes}m {sec:02d}s"


@cached("short")
def _list_applications(limit: int = 50) -> List[dict]:
    emr = client("emr-serverless")
    try:
        resp = emr.list_applications(maxResults=limit)
        apps = resp.get("applications", [])
    except (BotoCoreError, ClientError) as exc:
        log.error("EMR Serverless list_applications failed: %s", exc)
        raise

    arns = tags_service.project_arns()
    if arns is not None:
        apps = [a for a in apps if a.get("arn") in arns]
    return apps


def _latest_job_run(app_id: str) -> Optional[dict]:
    emr = client("emr-serverless")
    try:
        resp = emr.list_job_runs(applicationId=app_id, maxResults=1)
        runs = resp.get("jobRuns", [])
        return runs[0] if runs else None
    except (BotoCoreError, ClientError) as exc:
        log.warning("EMR Serverless list_job_runs(%s) failed: %s", app_id, exc)
        return None


@cached("short")
def recent_runs() -> List[PipelineRun]:
    """One row per EMR Serverless application, status from its latest job run."""
    out: List[PipelineRun] = []
    for app in _list_applications():
        app_id = app.get("id", "")
        latest = _latest_job_run(app_id) or {}
        state = latest.get("state") or app.get("state", "")
        out.append(
            PipelineRun(
                id=app_id,
                pipelineName=app.get("name", app_id),
                status=_JOB_STATUS.get(state, "Waiting"),
                startTime=_iso(latest.get("createdAt")),
                endTime=_iso(latest.get("updatedAt")),
                duration=_fmt_duration(latest.get("createdAt"), latest.get("updatedAt")),
                costPerRun=0.0,
            )
        )
    return out


def _resolve_app_id(name_or_id: str) -> Optional[str]:
    for app in _list_applications():
        if app.get("id") == name_or_id or app.get("name") == name_or_id:
            return app.get("id")
    return None


@cached("medium")
def history_for(application: str, limit: int = 20) -> List[PipelineHistoryItem]:
    """Job runs of an application (by app id or name) as run-history items."""
    app_id = _resolve_app_id(application)
    if not app_id:
        return []
    emr = client("emr-serverless")
    try:
        resp = emr.list_job_runs(applicationId=app_id, maxResults=limit)
    except (BotoCoreError, ClientError) as exc:
        log.error("EMR Serverless list_job_runs(%s) failed: %s", app_id, exc)
        raise
    items: List[PipelineHistoryItem] = []
    for r in resp.get("jobRuns", []):
        start = r.get("createdAt")
        end = r.get("updatedAt")
        duration_min = round((end - start).total_seconds() / 60.0, 2) if (start and end) else 0.0
        items.append(
            PipelineHistoryItem(
                # id is the job run id — the identifier used to fetch EMR Serverless logs.
                id=r.get("id", ""),
                status=_JOB_STATUS.get(r.get("state", ""), "Waiting"),
                startTime=_iso(start),
                durationMin=duration_min,
                cost=0.0,
                recordsProcessed=0,
                errorMessage=r.get("stateDetails"),
            )
        )
    return items
