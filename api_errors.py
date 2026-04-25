"""Canonical error_code catalog (BUILD_PLAN_v2 §2.5).

The mobile client routes errors to UX (toast / full-screen / reconnect
prompt) based on `error_code`. Keep this module the single source of
truth — adding a new code without updating the mobile handler means the
user gets a generic toast instead of a targeted response.

Contract: every API route that can fail should return
  { "ok": false, "error": "<short human string>", "error_code": "<one of below>" }
with an appropriate HTTP status code.
"""

from __future__ import annotations

from typing import Any

from flask import jsonify


# ── Canonical codes ──────────────────────────────────────────────────────

# Auth
UNAUTHORIZED = 'unauthorized'
FORBIDDEN = 'forbidden'

# Clerk-bridge specific (retained from A0)
MISSING_TOKEN = 'missing_token'
CLERK_TOKEN_INVALID = 'clerk_token_invalid'
CLERK_API_UNAVAILABLE = 'clerk_api_unavailable'
SERVER_CONFIG = 'server_config'

# Generic
NOT_FOUND = 'not_found'
VALIDATION_FAILED = 'validation_failed'
RATE_LIMITED = 'rate_limited'
UPSTREAM_UNAVAILABLE = 'upstream_unavailable'
DB_ERROR = 'db_error'
SERVER_ERROR = 'server_error'

# Connectors
CONNECTOR_NOT_FOUND = 'connector_not_found'
CONNECTOR_EXPIRED = 'connector_expired'
CONNECTOR_REVOKED = 'connector_revoked'
CONNECTOR_ERROR = 'connector_error'
OAUTH_STATE_INVALID = 'oauth_state_invalid'
OAUTH_EXCHANGE_FAILED = 'oauth_exchange_failed'

# Paywall / tier
PAYWALL_REQUIRED = 'paywall_required'
TIER_GATE = 'tier_gate'
SLOT_LIMIT_REACHED = 'slot_limit_reached'


ALL_CODES: frozenset[str] = frozenset({
    UNAUTHORIZED, FORBIDDEN,
    MISSING_TOKEN, CLERK_TOKEN_INVALID, CLERK_API_UNAVAILABLE, SERVER_CONFIG,
    NOT_FOUND, VALIDATION_FAILED, RATE_LIMITED, UPSTREAM_UNAVAILABLE,
    DB_ERROR, SERVER_ERROR,
    CONNECTOR_NOT_FOUND, CONNECTOR_EXPIRED, CONNECTOR_REVOKED, CONNECTOR_ERROR,
    OAUTH_STATE_INVALID, OAUTH_EXCHANGE_FAILED,
    PAYWALL_REQUIRED, TIER_GATE, SLOT_LIMIT_REACHED,
})


# ── Convenience helper for routes ────────────────────────────────────────


def err(code: str, message: str, status: int = 400, **extra: Any):
    """Shape an error response. Flask routes call:
      return err(CONNECTOR_EXPIRED, "Reconnect required", 409)
    instead of hand-rolling the jsonify body. Adds any extra kwargs
    (e.g. slot_limit=6) to the payload."""
    if code not in ALL_CODES:
        # Don't crash on an unlisted code — log + use it verbatim. Keeps
        # routes composable; but this is the signal to add the code here.
        import logging as _log_mod
        _log_mod.getLogger(__name__).warning(
            "api_errors.err: unknown error_code=%r (add to ALL_CODES)", code,
        )
    body = {'ok': False, 'error': message, 'error_code': code, **extra}
    return jsonify(body), status
