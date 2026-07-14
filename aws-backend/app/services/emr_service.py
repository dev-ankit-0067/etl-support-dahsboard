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
    return runs


@cached("medium")
def kpis() -> EMRKpis:
    clusters = list_clusters()
    total = len(clusters)
    active = sum(1 for c in clusters if c.state in ("RUNNING", "STARTING"))
    failed = sum(1 for c in clusters if c.state in ("TERMINATED_WITH_ERRORS", "TERMINATED"))
    return EMRKpis(totalClusters=total, activeClusters=active, failedClusters=failed)
