"""S3-backed dynamic runtime configuration with environment fallback.

Settings that used to live only in environment variables (incident provider,
project tag values, per-project S3 log paths) can be moved to a JSON document
stored in S3. The app re-fetches the document every ``CONFIG_REFRESH_SECONDS``
(default 60s) so changes apply without a redeploy. If S3 is unreachable the last
good copy is kept; if none exists the plain env-based ``Settings`` is used.

Document shape (CONFIG_S3_BUCKET / CONFIG_S3_KEY):

    {
      "incidentProvider": "jira",              // overrides INCIDENT_PROVIDER
      "tagKey": "project",                     // overrides PROJECT_TAG_KEY
      "projects": [
        {"value": "poc",  "s3LogPath": "etl-logs/poc"},
        {"value": "prod", "tagKey": "environment",
         "s3LogBucket": "prod-etl-logs", "s3LogPath": "runs/archive"}
      ]
    }

Per-project ``s3LogPath`` is an S3 prefix (folder) that holds that project's log
files; the walker descends through any sub-folders until it reaches the files.
"""
from __future__ import annotations

import json
import logging
import threading
import time
from typing import List, Optional, Tuple

from botocore.exceptions import BotoCoreError, ClientError
from pydantic import BaseModel, Field

from .aws import client
from .config import get_settings

log = logging.getLogger(__name__)


class ProjectConfig(BaseModel):
    """Per-project runtime configuration."""

    value: str = Field(description="Project tag value (as selected in the dashboard dropdown).")
    tagKey: Optional[str] = Field(
        default=None,
        description="Optional per-project tag key override; falls back to the global tag key.",
    )
    s3LogBucket: Optional[str] = Field(
        default=None,
        description="Bucket holding this project's logs; falls back to S3_LOG_BUCKET.",
    )
    s3LogPath: Optional[str] = Field(
        default=None,
        description="S3 prefix (folder) under which this project's logs live.",
    )
    s3LogLabel: Optional[str] = Field(
        default=None,
        description="Display label for the S3 log source in the UI (defaults to 'S3').",
    )


class RemoteConfigFile(BaseModel):
    """The JSON document stored in S3."""

    incidentProvider: Optional[str] = Field(
        default=None,
        description="'jira' | 'servicenow'; falls back to INCIDENT_PROVIDER.",
    )
    tagKey: Optional[str] = Field(
        default=None,
        description="Global resource tag key; falls back to PROJECT_TAG_KEY.",
    )
    projects: List[ProjectConfig] = Field(default_factory=list)


class _RemoteConfigStore:
    """Thread-safe holder that re-fetches the S3 document on a TTL."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._loaded_at = 0.0
        self._config: Optional[RemoteConfigFile] = None

    def get(self) -> Optional[RemoteConfigFile]:
        """Return the current remote config, or None when not configured/loadable."""
        settings = get_settings()
        if not settings.config_s3_bucket or not settings.config_s3_key:
            return None
        ttl = max(settings.config_refresh_seconds, 0)
        with self._lock:
            if self._config is not None and ttl and time.monotonic() - self._loaded_at < ttl:
                return self._config
            try:
                obj = client("s3").get_object(
                    Bucket=settings.config_s3_bucket, Key=settings.config_s3_key
                )
                raw = obj["Body"].read().decode("utf-8", errors="replace")
                self._config = RemoteConfigFile.model_validate(json.loads(raw))
                log.info(
                    "Loaded remote config from s3://%s/%s (%d projects, provider=%r)",
                    settings.config_s3_bucket,
                    settings.config_s3_key,
                    len(self._config.projects),
                    self._config.incidentProvider,
                )
            except (BotoCoreError, ClientError, ValueError, TypeError, KeyError) as exc:
                # Keep serving the last good copy; only warn when we have none.
                if self._config is None:
                    log.warning(
                        "Failed to load remote config from s3://%s/%s: %s",
                        settings.config_s3_bucket,
                        settings.config_s3_key,
                        exc,
                    )
                else:
                    log.warning("Remote config refresh failed (using last good copy): %s", exc)
            self._loaded_at = time.monotonic()
            return self._config


_store = _RemoteConfigStore()


def get_config() -> Optional[RemoteConfigFile]:
    """The raw remote configuration document, or None (not configured)."""
    return _store.get()


# ---------------------------------------------------------------------------
# Accessors (each falls back to env-based Settings when the remote doc is absent)
# ---------------------------------------------------------------------------

def incident_provider() -> str:
    """The active incident provider ('jira' | 'servicenow')."""
    cfg = _store.get()
    if cfg and cfg.incidentProvider:
        return cfg.incidentProvider.strip().lower()
    return get_settings().incident_provider_name


def tag_key(project: Optional[str] = None) -> str:
    """Resource tag key used to filter resources; per-project override wins."""
    cfg = _store.get()
    if cfg:
        if project:
            for p in cfg.projects:
                if p.value == project and p.tagKey:
                    return p.tagKey
        if cfg.tagKey:
            return cfg.tagKey
    return get_settings().project_tag_key


def project_values() -> List[str]:
    """The selectable project tag values ('all' is added by the router)."""
    cfg = _store.get()
    if cfg and cfg.projects:
        return [p.value for p in cfg.projects if p.value.strip()]
    return get_settings().project_value_list


def s3_log_label(project: str) -> Optional[str]:
    """Custom UI label for the S3 log source of a project, or None ('S3')."""
    cfg = _store.get()
    if cfg:
        for p in cfg.projects:
            if p.value == project and p.s3LogLabel:
                return p.s3LogLabel
    return None


def source_for(project: str) -> Tuple[Optional[str], str, str]:
    """The (bucket, prefix, project) S3 log source for a single project.

    Falls back to ``<bucket>/<project>/`` (legacy layout) when the project has
    no explicit ``s3LogPath`` in the remote config.
    """
    settings = get_settings()
    cfg = _store.get()
    if cfg:
        for p in cfg.projects:
            if p.value == project:
                if p.s3LogPath:
                    return (p.s3LogBucket or settings.s3_log_bucket,
                            p.s3LogPath.strip("/") + "/", project)
                return (settings.s3_log_bucket, f"{project}/", project)
    return (settings.s3_log_bucket, f"{project}/", project)


def log_bucket(identifier: str) -> Tuple[Optional[str], Optional[str]]:
    """Resolve the (bucket, project) for a log identifier.

    Uses the longest matching configured ``s3LogPath`` (identifier = object key
    without the ``.log`` suffix); falls back to the env ``S3_LOG_BUCKET`` when
    no project prefix matches. Returns (None, None) when nothing is configured.
    """
    settings = get_settings()
    stem = (identifier or "").lstrip("/")
    if stem.endswith(".log"):
        stem = stem[: -len(".log")]
    cfg = _store.get()
    if cfg:
        best: Optional[Tuple[int, Optional[str], str]] = None
        for p in cfg.projects:
            path = (p.s3LogPath or "").strip("/")
            if path and (stem == path or stem.startswith(path + "/")):
                if best is None or len(path) > best[0]:
                    best = (len(path), p.s3LogBucket or settings.s3_log_bucket, p.value)
        if best:
            return best[1], best[2]
    return settings.s3_log_bucket, None


def log_sources() -> List[Tuple[Optional[str], str, str]]:
    """All (bucket, prefix, project) sources to list when no project is selected.

    With remote config: one entry per configured project (explicit ``s3LogPath``
    or legacy ``<value>/`` fallback). Without it: env ``PROJECT_VALUES`` prefixes,
    or a single bucket-wide listing when no project values are configured.
    """
    settings = get_settings()
    cfg = _store.get()
    sources: List[Tuple[Optional[str], str, str]] = []
    if cfg and cfg.projects:
        for p in cfg.projects:
            if p.s3LogPath:
                sources.append((p.s3LogBucket or settings.s3_log_bucket,
                                p.s3LogPath.strip("/") + "/", p.value))
            elif settings.s3_log_bucket:
                sources.append((settings.s3_log_bucket, f"{p.value}/", p.value))
        return sources
    if settings.s3_log_bucket:
        values = settings.project_value_list
        if values:
            return [(settings.s3_log_bucket, f"{v}/", v) for v in values]
        return [(settings.s3_log_bucket, "", "")]
    return []
