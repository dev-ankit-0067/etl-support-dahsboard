"""Custom S3 log source.

Logs live under per-project prefixes configured in the remote (S3) config
document (``s3LogPath`` per project value), or in the legacy layout
``s3://<bucket>/<project>/<run-id>.log``. Listing is scoped to the active
project's prefix; when no project is selected ("all") every configured project
prefix is listed. Prefixes may contain further sub-folders — the walker descends
through them until it reaches the ``.log`` files. The identifier used for a
single log is the object key without the ``.log`` suffix, so it already carries
the full path and works in both cases.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Iterator, List, Optional, Tuple

from botocore.exceptions import BotoCoreError, ClientError

from ..aws import client
from ..cache import cached
from ..config import get_settings
from .. import remote_config
from . import tags_service

log = logging.getLogger(__name__)

_MAX_WALK_DEPTH = 20


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _iter_log_objects(
    s3, bucket: str, prefix: str, max_depth: int = _MAX_WALK_DEPTH
) -> Iterator[Tuple[str, datetime, int]]:
    """Yield (key, lastModified, size) for every `.log` file under ``prefix``.

    Descends iteratively into sub-folders (CommonPrefixes) until files are
    reached, so a configured prefix may contain arbitrary nesting.
    """
    base = prefix if not prefix or prefix.endswith("/") else prefix + "/"
    stack: List[Tuple[str, int]] = [(base, 0)]
    while stack:
        current, depth = stack.pop()
        if depth > max_depth:
            log.warning("S3 log walk exceeded max depth %d at s3://%s/%s", max_depth, bucket, current)
            continue
        paginator = s3.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=bucket, Prefix=current, Delimiter="/"):
            for folder in page.get("CommonPrefixes", []):
                stack.append((folder["Prefix"], depth + 1))
            for obj in page.get("Contents", []):
                key = obj["Key"]
                if key.endswith(".log"):
                    yield key, obj["LastModified"], int(obj["Size"])


def _run_record(
    key: str, last_modified: datetime, size: int, project: str
) -> dict:
    """Build a run record from a log object key."""
    stem = key[: -len(".log")]
    run_id = stem.rsplit("/", 1)[-1]
    return {
        "id": stem,                 # identifier passed to log/agent endpoints
        "runId": run_id,            # display name (filename stem)
        "project": project,
        "lastModified": last_modified.astimezone(timezone.utc).isoformat(),
        "sizeBytes": size,
    }


@cached("short")
def list_runs(limit: int = 500) -> List[dict]:
    """List `.log` objects under the active project's prefix(es) as run records."""
    settings = get_settings()
    project = tags_service.active_project()

    if project:
        bucket, prefix, _ = remote_config.source_for(project)
        sources = [(bucket, prefix, project)] if bucket else []
    else:
        sources = [(b, p, prj) for b, p, prj in remote_config.log_sources() if b]

    if not sources:
        # Nothing configured at all — keep the legacy bucket-wide listing.
        if not settings.s3_log_bucket:
            log.warning("S3_LOG_BUCKET not configured; S3 log listing is empty.")
            return []
        sources = [(settings.s3_log_bucket, "", "")]

    s3 = client("s3")
    runs: List[dict] = []
    seen: set = set()
    for bucket, prefix, src_project in sources:
        try:
            for key, last_modified, size in _iter_log_objects(s3, bucket, prefix):
                if key in seen:
                    continue
                seen.add(key)
                project_name = src_project or _project_for_key(key, prefix)
                runs.append(_run_record(key, last_modified, size, project_name))
        except (BotoCoreError, ClientError) as exc:
            log.error("Failed to list S3 logs in bucket %s (prefix %r): %s", bucket, prefix, exc)

    runs.sort(key=lambda r: r["lastModified"], reverse=True)
    return runs[:limit]


def _project_for_key(key: str, prefix: str) -> str:
    """Best-effort project label for a key: the source's folder name, or ''."""
    relative = key[len(prefix):] if prefix else key
    first, _, _ = relative.partition("/")
    return first or ""


def get_logs(identifier: str, limit: int = 1000) -> dict:
    """Read a single log object (``<identifier>.log``) and return its lines as events.

    The bucket is resolved from the remote config (the project whose ``s3LogPath``
    covers the identifier), falling back to the env ``S3_LOG_BUCKET``. Always
    returns a payload — never raises — so the UI shows a message instead of 500s.
    """
    now = _now()

    # Guard against path traversal / absolute keys — we only ever read within a bucket.
    ident = (identifier or "").lstrip("/")
    if ".." in ident.split("/"):
        return {"key": identifier, "events": [], "message": "Invalid log identifier", "timestamp": now}

    bucket, project = remote_config.log_bucket(ident)
    if not bucket:
        return {"key": ident, "events": [], "message": "No S3 log bucket configured for this log", "timestamp": now}

    key = ident if ident.endswith(".log") else f"{ident}.log"
    s3 = client("s3")
    try:
        obj = s3.get_object(Bucket=bucket, Key=key)
        body = obj["Body"].read().decode("utf-8", errors="replace")
        modified = obj.get("LastModified")
        ts = modified.astimezone(timezone.utc).isoformat() if modified else ""
    except Exception as exc:  # noqa: BLE001 - never 500 a user-facing read
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
