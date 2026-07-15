"""AWS EMR-backed metrics and cluster data.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import List

from botocore.exceptions import BotoCoreError, ClientError

from ..aws import client
from ..cache import cached
from ..models.emr import EMRCluster, EMRRun, EMRKpis

log = logging.getLogger(__name__)


@cached("medium")
def list_clusters(states: List[str] | None = None) -> List[EMRCluster]:
    emr = client("emr")
    out: List[EMRCluster] = []
    try:
        kwargs = {}
        if states:
            kwargs["ClusterStates"] = states
        resp = emr.list_clusters(**kwargs)
    except (BotoCoreError, ClientError) as exc:
        log.error("EMR list_clusters failed: %s", exc)
        raise
    for c in resp.get("Clusters", []):
        out.append(
            EMRCluster(
                id=c.get("Id", ""),
                name=c.get("Name", ""),
                state=c.get("Status", {}).get("State", ""),
                createdAt=(c.get("Status", {}).get("Timeline", {}).get("CreationDateTime") or datetime.now(timezone.utc)).isoformat(),
            )
        )
    return out


def _format_run_duration(started: datetime | None, finished: datetime | None) -> Optional[str]:
    if not started:
        return None
    end_time = finished or datetime.now(timezone.utc)
    duration = end_time - started
    return f"{duration.total_seconds() / 60:.1f}m"


@cached("medium")
def list_serverless_applications(states: List[str] | None = None) -> List[EMRCluster]:
    emr_serverless = client("emr-serverless")
    out: List[EMRCluster] = []
    try:
        kwargs = {}
        if states:
            kwargs["states"] = states
        resp = emr_serverless.list_applications(**kwargs)
    except (BotoCoreError, ClientError) as exc:
        log.error("EMR Serverless list_applications failed: %s", exc)
        return out

    for app in resp.get("applications", []):
        out.append(
            EMRCluster(
                id=app.get("applicationId", ""),
                name=app.get("name", ""),
                state=app.get("state", ""),
                createdAt=(app.get("createdAt") or datetime.now(timezone.utc)).isoformat(),
            )
        )
    return out


@cached("short")
def recent_serverless_runs(limit_per_application: int = 3) -> List[EMRRun]:
    emr_serverless = client("emr-serverless")
    runs: List[EMRRun] = []
    applications = list_serverless_applications()

    for app in applications:
        app_id = app.id
        try:
            resp = emr_serverless.list_job_runs(ApplicationId=app_id, MaxResults=limit_per_application)
        except (BotoCoreError, ClientError) as exc:
            log.warning("EMR Serverless list_job_runs failed for %s: %s", app_id, exc)
            continue

        for jr in resp.get("jobRuns", []):
            status = jr.get("state", "")
            started = jr.get("startedAt")
            finished = jr.get("finishedAt")
            runs.append(
                EMRRun(
                    id=jr.get("id", ""),
                    clusterId=app_id,
                    clusterName=app.name,
                    name=jr.get("name", ""),
                    status=status,
                    startTime=started.isoformat() if started else "",
                    endTime=finished.isoformat() if finished else None,
                    duration=_format_run_duration(started, finished),
                    serviceType="serverless",
                )
            )
    return runs


@cached("short")
def recent_runs(limit_per_cluster: int = 3) -> List[EMRRun]:
    emr = client("emr")
    runs: List[EMRRun] = []
    clusters = list_clusters()
    for c in clusters:
        cid = c.id
        try:
            resp = emr.list_steps(ClusterId=cid, MaxResults=limit_per_cluster)
        except (BotoCoreError, ClientError) as exc:
            log.warning("EMR list_steps failed for %s: %s", cid, exc)
            continue
        for s in resp.get("Steps", []):
            status = s.get("Status", {}).get("State", "")
            started = s.get("Status", {}).get("Timeline", {}).get("StartDateTime")
            finished = s.get("Status", {}).get("Timeline", {}).get("EndDateTime")
            runs.append(
                EMRRun(
                    id=s.get("Id", ""),
                    clusterId=cid,
                    name=s.get("Name", ""),
                    status=status,
                    startTime=started.isoformat() if started else "",
                    endTime=finished.isoformat() if finished else None,
                    duration=None,
                )
            )

    runs.extend(recent_serverless_runs(limit_per_cluster))
    return runs


@cached("medium")
def kpis() -> EMRKpis:
    clusters = list_clusters()
    applications = list_serverless_applications()
    total = len(clusters) + len(applications)
    active = sum(1 for c in clusters if c.state in ("RUNNING", "STARTING"))
    active += sum(1 for app in applications if app.state in ("RUNNING", "STARTING", "STARTED"))
    failed = sum(1 for c in clusters if c.state in ("TERMINATED_WITH_ERRORS", "TERMINATED"))
    failed += sum(1 for app in applications if app.state in ("FAILED", "CANCELLED", "CANCELLING"))
    return EMRKpis(totalClusters=total, activeClusters=active, failedClusters=failed)
