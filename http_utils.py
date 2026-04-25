"""Shared HTTP utility: exponential-backoff retry wrapper (BUILD_PLAN_v2 §2.4).

Apply to any outbound HTTP call that can fail transiently — Claude API,
OAuth token exchange, provider data sync. NOT for anything with side
effects you don't want duplicated (POST with mutation, etc.); limit
retry to idempotent GETs or explicitly-marked safe calls.

Usage:
    import http_utils as _h

    @_h.retryable()
    def fetch_something():
        return requests.get(...)

    result = fetch_something()

Or for a one-off call:
    result = _h.with_retry(lambda: requests.get(...))
"""

from __future__ import annotations

import functools
import logging
import time
from typing import Callable, TypeVar

import requests

_log = logging.getLogger(__name__)

T = TypeVar('T')

# Defaults: 3 retries × (0.5, 1.0, 2.0)s = 3.5s worst case before giving up.
# Tuned for fast-feedback user-facing paths. Tune up (e.g. retries=5, max=30s)
# for background jobs that can tolerate slow recovery.
_DEFAULT_RETRIES = 3
_DEFAULT_BASE = 0.5
_DEFAULT_MAX = 4.0

# HTTP statuses considered transient / retryable.
_TRANSIENT_STATUSES = frozenset({429, 500, 502, 503, 504})


class Retryable(Exception):
    """Raise to force a retry without depending on HTTP status / exception type."""


def _is_retryable(exc: Exception) -> bool:
    if isinstance(exc, Retryable):
        return True
    if isinstance(exc, requests.Timeout):
        return True
    if isinstance(exc, requests.ConnectionError):
        return True
    if isinstance(exc, requests.HTTPError):
        resp = getattr(exc, 'response', None)
        if resp is not None and resp.status_code in _TRANSIENT_STATUSES:
            return True
    return False


def with_retry(
    fn: Callable[[], T],
    *,
    retries: int = _DEFAULT_RETRIES,
    base_delay: float = _DEFAULT_BASE,
    max_delay: float = _DEFAULT_MAX,
    label: str | None = None,
) -> T:
    """Invoke `fn` with exponential backoff. Raises on final failure.

    `retries` counts *additional* attempts after the first try, matching
    common intuition ("retries=3" → 4 total attempts). Delay grows as
    min(base_delay * 2**n, max_delay) with no jitter (add if you need
    thundering-herd protection).
    """
    attempt = 0
    last_exc: Exception | None = None
    while attempt <= retries:
        try:
            return fn()
        except Exception as e:
            last_exc = e
            if attempt == retries or not _is_retryable(e):
                break
            delay = min(base_delay * (2 ** attempt), max_delay)
            _log.warning(
                "with_retry: attempt %d/%d for %s failed (%s); retrying in %.2fs",
                attempt + 1, retries + 1, label or fn.__name__, type(e).__name__, delay,
            )
            time.sleep(delay)
            attempt += 1
    assert last_exc is not None
    raise last_exc


def retryable(
    *,
    retries: int = _DEFAULT_RETRIES,
    base_delay: float = _DEFAULT_BASE,
    max_delay: float = _DEFAULT_MAX,
):
    """Decorator form of with_retry. Preserves fn signature."""
    def decorator(fn):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            return with_retry(
                lambda: fn(*args, **kwargs),
                retries=retries,
                base_delay=base_delay,
                max_delay=max_delay,
                label=fn.__name__,
            )
        return wrapper
    return decorator
