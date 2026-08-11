"""Project tag filtering via the Resource Groups Tagging API.

Resolves the set of resource ARNs tagged `<project_tag_key>=<project>`, which the
resource services intersect against to filter Glue/Lambda/EMR/etc. by project.
"""
from __future__ import annotations

import logging
from functools import lru_cache
from typing import Optional, Set

from botocore.exceptions import BotoCoreError, ClientError

from ..aws import client
from ..cache import cached
from ..config import get_settings
from ..context import current_project

log = logging.getLogger(__name__)


def active_project() -> Optional[str]:
    """The current request's project filter, or None for 'all'."""
    p = current_project.get()
    if not p or p.lower() == "all":
        return None
    return p


@lru_cache(maxsize=1)
def account_id() -> str:
    return client("sts").get_caller_identity()["Account"]


@cached("medium")
def arns_for_project(project: str) -> Set[str]:
    """All resource ARNs tagged with the project tag key = the given value."""
    s = get_settings()
    tagging = client("resourcegroupstaggingapi")
    arns: Set[str] = set()
    try:
        paginator = tagging.get_paginator("get_resources")
        for page in paginator.paginate(
            TagFilters=[{"Key": s.project_tag_key, "Values": [project]}]
        ):
            for m in page.get("ResourceTagMappingList", []):
                arns.add(m["ResourceARN"])
    except (BotoCoreError, ClientError) as exc:
        log.error("get_resources(project=%s) failed: %s", project, exc)
        raise
    return arns


def project_arns() -> Optional[Set[str]]:
    """ARNs allowed by the active project filter, or None when unfiltered."""
    project = active_project()
    if project is None:
        return None
    return arns_for_project(project)
