"""RCA / repeat-incident insights derived from SSM Incident Manager analyses."""
from __future__ import annotations

import logging
from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import List

from botocore.exceptions import BotoCoreError, ClientError

from ..aws import client
from ..cache import cached
from ..config import get_settings
from ..models.rca import LifecycleStage, RcaLifecycle, RepeatIncident

log = logging.getLogger(__name__)

_STAGE_ORDER = ["Detect", "Acknowledge", "Mitigate", "Resolve", "RCA Published"]


@cached("medium")
def lifecycle(days: int = 30) -> RcaLifecycle:
    settings = get_settings()
    if settings.use_jira_incidents:
        return RcaLifecycle(stages=[
            LifecycleStage(stage="Detect", avgMinutes=0),
            LifecycleStage(stage="Acknowledge", avgMinutes=0),
            LifecycleStage(stage="Mitigate", avgMinutes=0),
            LifecycleStage(stage="Resolve", avgMinutes=0),
            LifecycleStage(stage="RCA Published", avgMinutes=0),
        ])

    si = client("ssm-incidents")
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    detect: List[float] = []
    ack: List[float] = []
    mitigate: List[float] = []
    resolve: List[float] = []
    rca: List[float] = []

    try:
        paginator = si.get_paginator("list_incident_records")
        for page in paginator.paginate(
            filters=[{"key": "creationTime", "condition": {"after": cutoff}}]
        ):
            for it in page.get("incidentRecordSummaries", []):
                created = it.get("creationTime")
                if not created:
                    continue
                resolved = it.get("resolvedTime")
                if resolved:
                    resolve.append((resolved - created).total_seconds() / 60.0)
                # Heuristic stage durations from automation timeline if present
                tl = it.get("timelineEvents", [])
                for ev in tl:
                    et = ev.get("eventType", "").lower()
                    delta = (ev.get("eventTime", created) - created).total_seconds() / 60.0
                    if "detect" in et:
                        detect.append(delta)
                    elif "ack" in et:
                        ack.append(delta)
                    elif "mitigat" in et:
                        mitigate.append(delta)
                    elif "post" in et or "rca" in et:
                        rca.append(delta)
    except (BotoCoreError, ClientError) as exc:
        log.error("RCA lifecycle aggregation failed: %s", exc)
        raise

    def _avg(xs: List[float]) -> float:
        return round(sum(xs) / len(xs), 2) if xs else 0.0

    stages = [
        LifecycleStage(stage="Detect", avgMinutes=_avg(detect)),
        LifecycleStage(stage="Acknowledge", avgMinutes=_avg(ack)),
        LifecycleStage(stage="Mitigate", avgMinutes=_avg(mitigate)),
        LifecycleStage(stage="Resolve", avgMinutes=_avg(resolve)),
        LifecycleStage(stage="RCA Published", avgMinutes=_avg(rca)),
    ]
    stages.sort(key=lambda s: _STAGE_ORDER.index(s.stage))
    return RcaLifecycle(stages=stages)


@cached("medium")
def repeat_incidents(days: int = 30, top_n: int = 10) -> List[RepeatIncident]:
    settings = get_settings()
    if settings.use_jira_incidents:
        return []

    si = client("ssm-incidents")
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    pipeline_counts: Counter = Counter()
    last_seen: dict = {}
    causes: dict = {}
    try:
        paginator = si.get_paginator("list_incident_records")
        for page in paginator.paginate(
            filters=[{"key": "creationTime", "condition": {"after": cutoff}}]
        ):
            for it in page.get("incidentRecordSummaries", []):
                title = it.get("title", "")
                pipeline = title.split(" - ", 1)[0]
                pipeline_counts[pipeline] += 1
                t = it.get("creationTime")
                if t and (pipeline not in last_seen or t > last_seen[pipeline]):
                    last_seen[pipeline] = t
                    causes[pipeline] = title.split(" - ", 1)[-1] if " - " in title else "Unknown"
    except (BotoCoreError, ClientError) as exc:
        log.error("repeat_incidents aggregation failed: %s", exc)
        raise

    out: List[RepeatIncident] = []
    for pipeline, count in pipeline_counts.most_common(top_n):
        if count < 2:
            continue
        out.append(
            RepeatIncident(
                pipeline=pipeline,
                occurrences=count,
                lastSeen=last_seen[pipeline].isoformat(),
                rootCause=causes.get(pipeline, "Unknown"),
            )
        )
    return out
