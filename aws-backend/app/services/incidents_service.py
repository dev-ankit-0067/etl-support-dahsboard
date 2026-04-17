"""SSM Incident Manager-backed incident data."""
from __future__ import annotations

import logging
from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import List

from botocore.exceptions import BotoCoreError, ClientError

from ..aws import client
from ..cache import cached
from ..models.incidents import (
    IncidentDistributionItem,
    IncidentRecord,
    IncidentSummary,
    MttrTrendPoint,
)

log = logging.getLogger(__name__)


_IMPACT_TO_SEVERITY = {1: "P1", 2: "P2", 3: "P3", 4: "P4", 5: "P5"}
_STATUS_MAP = {"OPEN": "Investigating", "RESOLVED": "Resolved", "CLOSED": "Closed"}


def _age(start: datetime) -> str:
    delta = datetime.now(timezone.utc) - start
    hours, rem = divmod(int(delta.total_seconds()), 3600)
    minutes = rem // 60
    return f"{hours}h {minutes:02d}m"


@cached("short")
def list_incidents(days: int = 30) -> List[dict]:
    si = client("ssm-incidents")
    items: List[dict] = []
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    try:
        paginator = si.get_paginator("list_incident_records")
        for page in paginator.paginate(
            filters=[
                {
                    "key": "creationTime",
                    "condition": {"after": cutoff},
                }
            ]
        ):
            items.extend(page.get("incidentRecordSummaries", []))
    except (BotoCoreError, ClientError) as exc:
        log.error("SSM list_incident_records failed: %s", exc)
        raise
    return items


@cached("short")
def summary() -> IncidentSummary:
    items = list_incidents(days=7)
    counts = Counter()
    sev_counts = Counter()
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    for it in items:
        status = it.get("status", "")
        sev = _IMPACT_TO_SEVERITY.get(it.get("impact", 3), "P3")
        sev_counts[sev] += 1
        if status == "OPEN":
            counts["open"] += 1
        if it.get("resolvedTime") and it["resolvedTime"] >= cutoff:
            counts["resolved24h"] += 1
    return IncidentSummary(
        open=counts["open"],
        acknowledged=counts.get("acknowledged", 0),
        resolved24h=counts["resolved24h"],
        p1=sev_counts.get("P1", 0),
        p2=sev_counts.get("P2", 0),
        p3=sev_counts.get("P3", 0),
    )


@cached("medium")
def mttr_trend(days: int = 14) -> List[MttrTrendPoint]:
    items = list_incidents(days=days)
    daily: dict = {}
    for d in range(days):
        key = (datetime.now(timezone.utc) - timedelta(days=days - 1 - d)).strftime("%Y-%m-%d")
        daily[key] = {"mtta": [], "mttr": [], "count": 0}

    for it in items:
        created = it.get("creationTime")
        if not created:
            continue
        key = created.strftime("%Y-%m-%d")
        if key not in daily:
            continue
        daily[key]["count"] += 1
        ack = it.get("automationExecutions", [{}])[0].get("startTime") if it.get("automationExecutions") else None
        if ack:
            daily[key]["mtta"].append((ack - created).total_seconds() / 60.0)
        resolved = it.get("resolvedTime")
        if resolved:
            daily[key]["mttr"].append((resolved - created).total_seconds() / 60.0)

    out: List[MttrTrendPoint] = []
    for date, vals in daily.items():
        out.append(
            MttrTrendPoint(
                date=date,
                mtta=round(sum(vals["mtta"]) / len(vals["mtta"]), 2) if vals["mtta"] else 0.0,
                mttr=round(sum(vals["mttr"]) / len(vals["mttr"]), 2) if vals["mttr"] else 0.0,
                incidents=vals["count"],
            )
        )
    return out


@cached("medium")
def distribution() -> List[IncidentDistributionItem]:
    items = list_incidents(days=30)
    counter = Counter(_IMPACT_TO_SEVERITY.get(it.get("impact", 3), "P3") for it in items)
    return [IncidentDistributionItem(severity=k, count=v) for k, v in sorted(counter.items())]


@cached("short")
def list_records(limit: int = 50) -> List[IncidentRecord]:
    items = list_incidents(days=14)[:limit]
    out: List[IncidentRecord] = []
    for it in items:
        created = it.get("creationTime") or datetime.now(timezone.utc)
        out.append(
            IncidentRecord(
                id=(it.get("arn") or "").split("/")[-1] or "INC-?",
                title=it.get("title", "Untitled incident"),
                severity=_IMPACT_TO_SEVERITY.get(it.get("impact", 3), "P3"),
                status=_STATUS_MAP.get(it.get("status", ""), "Open"),
                pipeline=(it.get("title", "").split(" - ", 1)[0]),
                domain="—",
                createdAt=created.isoformat(),
                owner=it.get("incidentRecordSource", {}).get("createdBy", "—"),
                age=_age(created),
            )
        )
    return out
