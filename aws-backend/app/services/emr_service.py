"""AWS EMR-on-EC2 backed data: clusters as rows, steps as run history."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import List, Optional

from botocore.exceptions import BotoCoreError, ClientError

from ..aws import client
from ..cache import cached
from ..config import get_settings
from ..models.pipelines import PipelineHistoryItem, PipelineRun
from . import tags_service

log = logging.getLogger(__name__)

_CLUSTER_STATUS = {
    "STARTING": "Running",
    "BOOTSTRAPPING": "Running",
    "RUNNING": "Running",
    "WAITING": "Success",
    "TERMINATING": "Running",
    "TERMINATED": "Success",
    "TERMINATED_WITH_ERRORS": "Failed",
}
_STEP_STATUS = {
    "PENDING": "Waiting",
    "CANCEL_PENDING": "Running",
    "RUNNING": "Running",
    "COMPLETED": "Success",
    "CANCELLED": "Failed",
    "FAILED": "Failed",
    "INTERRUPTED": "Failed",
}
_ALL_CLUSTER_STATES = list(_CLUSTER_STATUS.keys())


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
def _list_clusters(limit: int = 50) -> List[dict]:
    emr = client("emr")
    out: List[dict] = []
    try:
        resp = emr.list_clusters(ClusterStates=_ALL_CLUSTER_STATES)
        out = resp.get("Clusters", [])[:limit]
    except (BotoCoreError, ClientError) as exc:
        log.error("EMR list_clusters failed: %s", exc)
        raise

    arns = tags_service.project_arns()
    if arns is not None:
        region, account = get_settings().aws_region, tags_service.account_id()
        out = [
            c for c in out
            if (c.get("ClusterArn")
                or f"arn:aws:elasticmapreduce:{region}:{account}:cluster/{c.get('Id')}") in arns
        ]
    return out


@cached("short")
def recent_runs() -> List[PipelineRun]:
    """One row per EMR cluster (id = cluster id, used for log lookups)."""
    out: List[PipelineRun] = []
    for c in _list_clusters():
        status = c.get("Status", {}) or {}
        timeline = status.get("Timeline", {}) or {}
        out.append(
            PipelineRun(
                id=c.get("Id", ""),
                pipelineName=c.get("Name", c.get("Id", "")),
                status=_CLUSTER_STATUS.get(status.get("State", ""), "Waiting"),
                startTime=_iso(timeline.get("CreationDateTime")),
                endTime=_iso(timeline.get("EndDateTime")),
                duration=_fmt_duration(timeline.get("CreationDateTime"), timeline.get("EndDateTime")),
                costPerRun=0.0,
            )
        )
    return out


def _resolve_cluster_id(name_or_id: str) -> Optional[str]:
    if name_or_id.startswith("j-"):
        return name_or_id
    for c in _list_clusters():
        if c.get("Name") == name_or_id:
            return c.get("Id")
    return None


@cached("medium")
def history_for(cluster: str, limit: int = 20) -> List[PipelineHistoryItem]:
    """Steps of a cluster (by cluster id or name) as run-history items."""
    cluster_id = _resolve_cluster_id(cluster)
    if not cluster_id:
        return []
    emr = client("emr")
    try:
        resp = emr.list_steps(ClusterId=cluster_id)
    except (BotoCoreError, ClientError) as exc:
        log.error("EMR list_steps(%s) failed: %s", cluster_id, exc)
        raise
    items: List[PipelineHistoryItem] = []
    for s in resp.get("Steps", [])[:limit]:
        status = s.get("Status", {}) or {}
        timeline = status.get("Timeline", {}) or {}
        start = timeline.get("StartDateTime")
        end = timeline.get("EndDateTime")
        duration_min = round((end - start).total_seconds() / 60.0, 2) if (start and end) else 0.0
        failure = (status.get("FailureDetails", {}) or {}).get("Reason")
        items.append(
            PipelineHistoryItem(
                # id stays the cluster id — that's the identifier used to fetch EMR logs.
                id=cluster_id,
                status=_STEP_STATUS.get(status.get("State", ""), "Waiting"),
                startTime=_iso(start),
                durationMin=duration_min,
                cost=0.0,
                recordsProcessed=0,
                errorMessage=failure,
            )
        )
    return items
