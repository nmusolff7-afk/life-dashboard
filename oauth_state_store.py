"""Persistent OAuth state store (BUILD_PLAN_v2 §2.2).

Replaces Flask session storage for OAuth state, which loses state across
Flask restarts and between gunicorn workers. The state token is CSRF-safe
(random 32 bytes URL-safe) and single-use — consume_state() deletes the
row on successful match so replay fails.

TTL: 10 minutes. Older rows are purged opportunistically on each write.
"""

from __future__ import annotations

import secrets
import time

from db import get_conn


_TTL_SECONDS = 10 * 60


def _now() -> int:
    return int(time.time())


def create_state(user_id: int, provider: str,
                 code_verifier: str | None = None,
                 redirect_after: str | None = None) -> str:
    """Create and persist a state token. Returns the state string to
    include in the OAuth authorize URL. Call consume_state() in the
    callback to validate + retrieve context."""
    state = secrets.token_urlsafe(32)
    now = _now()
    with get_conn() as conn:
        # Purge expired rows. Cheap on a table that stays tiny.
        conn.execute(
            "DELETE FROM oauth_states WHERE created_at < ?",
            (now - _TTL_SECONDS,),
        )
        conn.execute("""
            INSERT INTO oauth_states (state, user_id, provider, code_verifier, redirect_after, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (state, user_id, provider, code_verifier, redirect_after, now))
        conn.commit()
    return state


def consume_state(state: str, *, expected_provider: str | None = None) -> dict | None:
    """Validate + single-use consume. Returns the stored context
    (user_id, provider, code_verifier, redirect_after) on success, or
    None if state is missing / expired / provider-mismatched.

    Row is DELETED on successful consumption so a replay attack fails
    even within the TTL window.
    """
    if not state:
        return None
    now = _now()
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM oauth_states WHERE state = ?",
            (state,),
        ).fetchone()
        if not row:
            return None
        if now - int(row['created_at']) > _TTL_SECONDS:
            # Expired — delete and fail closed
            conn.execute("DELETE FROM oauth_states WHERE state = ?", (state,))
            conn.commit()
            return None
        if expected_provider and row['provider'] != expected_provider:
            # Provider mismatch — still consume (don't let attacker retry)
            conn.execute("DELETE FROM oauth_states WHERE state = ?", (state,))
            conn.commit()
            return None
        result = dict(row)
        # Single-use: delete before returning
        conn.execute("DELETE FROM oauth_states WHERE state = ?", (state,))
        conn.commit()
    return result
