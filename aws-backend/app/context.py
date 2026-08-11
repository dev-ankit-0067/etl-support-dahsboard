"""Request-scoped context — the currently selected project tag filter."""
from contextvars import ContextVar
from typing import Optional

# None means "all projects" (no filter). Set per-request from the X-Project header.
current_project: ContextVar[Optional[str]] = ContextVar("current_project", default=None)


def get_current_project() -> Optional[str]:
    return current_project.get()
