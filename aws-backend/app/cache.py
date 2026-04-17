"""Thread-safe TTL caching helpers for AWS responses."""
from functools import wraps
from threading import Lock
from typing import Any, Callable

from cachetools import TTLCache

from .config import get_settings

_LOCK = Lock()
_settings = get_settings()

short = TTLCache(maxsize=_settings.cache_maxsize, ttl=_settings.cache_ttl_short)
medium = TTLCache(maxsize=_settings.cache_maxsize, ttl=_settings.cache_ttl_medium)
long_ = TTLCache(maxsize=_settings.cache_maxsize, ttl=_settings.cache_ttl_long)

_BUCKETS = {"short": short, "medium": medium, "long": long_}


def cached(bucket: str = "medium") -> Callable:
    """Decorator that caches sync function results in the named TTL bucket."""

    def decorator(fn: Callable) -> Callable:
        store = _BUCKETS[bucket]

        @wraps(fn)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            key = (fn.__qualname__, args, tuple(sorted(kwargs.items())))
            with _LOCK:
                if key in store:
                    return store[key]
            value = fn(*args, **kwargs)
            with _LOCK:
                store[key] = value
            return value

        wrapper.cache_clear = lambda: store.clear()  # type: ignore[attr-defined]
        return wrapper

    return decorator


def clear_all() -> None:
    for store in _BUCKETS.values():
        store.clear()
