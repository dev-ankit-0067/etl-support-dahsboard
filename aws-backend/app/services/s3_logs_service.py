"""Custom S3 log source.

Logs live at ``s3://<bucket>/<project>/<run-id>.log`` where ``<project>`` is the
selected project tag value (the dashboard's project dropdown, via the X-Project
header). Listing is scoped to the active project's prefix; when no project is
selected ("all") every prefix is listed. The identifier used for a single log is
the object key without the ``.log`` suffix (e.g. ``poc/run-123``), so it already
carries the project and works in both cases.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import List, Optional

from botocore.exceptions import BotoCoreError, ClientError

from ..aws import client
from ..cache import cached
from ..config import get_settings
from . import tags_service

log = logging.getLogger(__name__)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@cached("short")
def list_runs(limit: int = 500) -> List[dict]:
    """List `.log` objects under the active project's prefix as run records."""
    settings = get_settings()
    bucket = settings.s3_log_bucket
    if not bucket:
        log.warning("S3_LOG_BUCKET not configured; S3 log listing is empty.")
        return []

    project = tags_service.active_project()
    prefix = f"{project}/" if project else ""

    s3 = client("s3")
    runs: List[dict] = []
    try:
        paginator = s3.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
            for obj in page.get("Contents", []):
                key = obj["Key"]
                if not key.endswith(".log"):
                    continue
                stem = key[: -len(".log")]
                proj, _, run_id = stem.partition("/")
                if not run_id:  # object sitting at the bucket root (no <project>/ segment)
                    proj, run_id = "", proj
                runs.append(
                    {
                        "id": stem,                 # identifier passed to log/agent endpoints
                        "runId": run_id,            # display name (filename stem)
                        "project": proj,
                        "lastModified": obj["LastModified"].astimezone(timezone.utc).isoformat(),
                        "sizeBytes": int(obj["Size"]),
                    }
                )
    except (BotoCoreError, ClientError) as exc:
        log.error("Failed to list S3 logs in bucket %s (prefix %r): %s", bucket, prefix, exc)
        return []

    runs.sort(key=lambda r: r["lastModified"], reverse=True)
    return runs[:limit]


def get_logs(identifier: str, limit: int = 1000) -> dict:
    """Read a single log object (``<identifier>.log``) and return its lines as events."""
    settings = get_settings()
    bucket = settings.s3_log_bucket
    now = _now()
    if not bucket:
        return {"key": identifier, "events": [], "message": "S3_LOG_BUCKET not configured", "timestamp": now}

    # Guard against path traversal / absolute keys — we only ever read within the bucket.
    ident = (identifier or "").lstrip("/")
    if ".." in ident.split("/"):
        return {"key": identifier, "events": [], "message": "Invalid log identifier", "timestamp": now}

    key = ident if ident.endswith(".log") else f"{ident}.log"
    s3 = client("s3")
    try:
        obj = s3.get_object(Bucket=bucket, Key=key)
        body = obj["Body"].read().decode("utf-8", errors="replace")
        modified = obj.get("LastModified")
        ts = modified.astimezone(timezone.utc).isoformat() if modified else ""
    except (BotoCoreError, ClientError) as exc:
        log.error("Failed to read s3://%s/%s: %s", bucket, key, exc)
        return {"key": key, "logGroup": f"s3://{bucket}/{key}", "events": [],
                "message": f"Could not read s3://{bucket}/{key}: {exc}", "timestamp": now}

    lines = body.splitlines()
    if limit:
        lines = lines[-limit:]
    events = [{"timestamp": ts, "message": line, "stream": key} for line in lines]
    return {
        "key": key,
        "logGroup": f"s3://{bucket}/{key}",
        "events": events,
        "eventCount": len(events),
        "timestamp": now,
    }


def get_logs_text(identifier: str, limit: int = 2000) -> str:
    """Return the log content as plain text (used by the LLM agent tool)."""
    data = get_logs(identifier, limit=limit)
    events = data.get("events", [])
    if not events:
        return f"No log content found at {data.get('logGroup', identifier)}. {data.get('message', '')}".strip()
    return "\n".join(e["message"] for e in events)
