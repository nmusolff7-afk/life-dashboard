"""Strava integration — OAuth 2.0 flow, athlete profile, activity backfill,
and per-activity → workout_logs mapping (BUILD_PLAN_v2 §3.6).

Strava-specific notes (different from Gmail/Google):
  - Strava OAuth is plain code-flow with a client_secret — no PKCE support.
  - Token endpoint is under /api/v3/oauth/token (not /oauth/token).
  - The "mobile" authorize endpoint (/oauth/mobile/authorize) opens the
    Strava app via app-link if installed, otherwise falls back to web —
    much smoother for users who already have Strava on their phone.
  - Refresh tokens are long-lived but can rotate on every refresh — we
    must always store whatever refresh_token comes back, not assume the
    old one keeps working.
  - Strava Console "Authorization Callback Domain" is a DOMAIN string
    (no scheme). For our `lifedashboard://strava-callback` redirect,
    set the callback domain to `lifedashboard` in the Strava API settings.

Tokens are stored exclusively in `users_connectors` (no legacy table —
the codebase is consolidating on the unified table; gmail still has its
own legacy table for historical reasons but new connectors skip it).
"""

from __future__ import annotations

import logging
import os
import time
from datetime import date, datetime
from typing import Any
from urllib.parse import urlencode

import requests

logger = logging.getLogger(__name__)


# ── OAuth + API config ──────────────────────────────────────────────────────

STRAVA_CLIENT_ID     = os.environ.get("STRAVA_CLIENT_ID", "")
STRAVA_CLIENT_SECRET = os.environ.get("STRAVA_CLIENT_SECRET", "")

# Scopes:
#   read              — basic athlete profile (id, firstname, etc.)
#   activity:read_all — public + private activities (we ask for all so the
#                       user doesn't have to reconnect later if they want
#                       to see their private workouts).
STRAVA_SCOPES = "read,activity:read_all"

STRAVA_AUTH_URL_MOBILE = "https://www.strava.com/oauth/mobile/authorize"
STRAVA_AUTH_URL_WEB    = "https://www.strava.com/oauth/authorize"
STRAVA_TOKEN_URL       = "https://www.strava.com/api/v3/oauth/token"
STRAVA_DEAUTH_URL      = "https://www.strava.com/oauth/deauthorize"
STRAVA_API_BASE        = "https://www.strava.com/api/v3"

REQUEST_TIMEOUT = 15  # seconds


def is_configured() -> bool:
    """True if Strava OAuth client credentials are set in env."""
    return bool(STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET)


# ── OAuth helpers ───────────────────────────────────────────────────────────

def get_auth_url(redirect_uri: str, *, state: str = "",
                 mobile: bool = True) -> str:
    """Build the Strava consent URL.

    mobile=True uses /oauth/mobile/authorize, which deep-links into the
    Strava app if installed (smoother UX). Pass False for desktop/web.
    """
    params = {
        "client_id":       STRAVA_CLIENT_ID,
        "redirect_uri":    redirect_uri,
        "response_type":   "code",
        "scope":           STRAVA_SCOPES,
        "approval_prompt": "auto",  # 'force' if you want to re-prompt every time
        "state":           state,
    }
    base = STRAVA_AUTH_URL_MOBILE if mobile else STRAVA_AUTH_URL_WEB
    return f"{base}?{urlencode(params)}"


def exchange_code(code: str) -> dict:
    """Exchange authorization code for access + refresh tokens.

    Strava returns:
      {
        "token_type": "Bearer",
        "expires_at":   1690000000,   # unix seconds
        "expires_in":   21600,
        "refresh_token": "...",
        "access_token":  "...",
        "athlete": { id, firstname, lastname, ... }
      }
    Note `expires_at` is already a unix timestamp — no math needed.
    """
    payload = {
        "client_id":     STRAVA_CLIENT_ID,
        "client_secret": STRAVA_CLIENT_SECRET,
        "code":          code,
        "grant_type":    "authorization_code",
    }
    resp = requests.post(STRAVA_TOKEN_URL, data=payload, timeout=REQUEST_TIMEOUT)
    if not resp.ok:
        try:
            err_body = resp.json()
        except Exception:
            err_body = {"raw": resp.text[:500]}
        raise RuntimeError(f"Strava token endpoint {resp.status_code}: {err_body}")
    return resp.json()


def refresh_access_token(refresh_token: str) -> dict:
    """Refresh an expired access token. Strava may rotate refresh_token
    on every call — always persist whatever comes back.

    Returns dict with: access_token, refresh_token, expires_at, expires_in.
    Shape matches the contract `connectors.get_valid_access_token` expects
    when it's used as the `refresh_fn` callback.
    """
    payload = {
        "client_id":     STRAVA_CLIENT_ID,
        "client_secret": STRAVA_CLIENT_SECRET,
        "refresh_token": refresh_token,
        "grant_type":    "refresh_token",
    }
    resp = requests.post(STRAVA_TOKEN_URL, data=payload, timeout=REQUEST_TIMEOUT)
    resp.raise_for_status()
    return resp.json()


def deauthorize(access_token: str) -> None:
    """Tell Strava to revoke our access. Best-effort — failure is non-fatal
    because we'll still flip the local connector row to revoked.
    """
    try:
        requests.post(
            STRAVA_DEAUTH_URL,
            data={"access_token": access_token},
            timeout=REQUEST_TIMEOUT,
        )
    except Exception as e:
        logger.warning("Strava: deauthorize call failed (non-fatal): %s", e)


# ── API: athlete + activities ───────────────────────────────────────────────

def get_athlete(access_token: str) -> dict:
    """Fetch the authenticated athlete's profile."""
    resp = requests.get(
        f"{STRAVA_API_BASE}/athlete",
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=REQUEST_TIMEOUT,
    )
    resp.raise_for_status()
    return resp.json()


def fetch_activities(access_token: str, *,
                     after_unix: int | None = None,
                     per_page: int = 100,
                     max_pages: int = 5) -> list[dict]:
    """Fetch the athlete's activities, paginated.

    Strava activity endpoint: GET /athlete/activities?after=<unix>&per_page=N&page=M
    Pagination terminates when a page returns fewer than per_page results
    OR we hit max_pages (a safety cap so a fresh connect with thousands of
    activities doesn't hammer the API; user can call /sync again later).

    Returns the full raw activity list (newest first per Strava's order).
    """
    headers = {"Authorization": f"Bearer {access_token}"}
    out: list[dict] = []
    for page in range(1, max_pages + 1):
        params: dict[str, Any] = {"per_page": per_page, "page": page}
        if after_unix is not None:
            params["after"] = int(after_unix)
        resp = requests.get(
            f"{STRAVA_API_BASE}/athlete/activities",
            headers=headers,
            params=params,
            timeout=REQUEST_TIMEOUT,
        )
        resp.raise_for_status()
        batch = resp.json()
        if not isinstance(batch, list) or not batch:
            break
        out.extend(batch)
        if len(batch) < per_page:
            break
    return out


# ── Activity → workout_logs mapping ─────────────────────────────────────────

# Strava activity types we recognize for session_type classification. Not
# exhaustive — anything not in these maps falls back to 'cardio' since that's
# what Strava primarily tracks.
_STRENGTH_TYPES = {"WeightTraining", "Workout", "Crossfit"}
_CARDIO_TYPES = {
    "Run", "Ride", "Swim", "Walk", "Hike", "VirtualRun", "VirtualRide",
    "TrailRun", "Rowing", "Elliptical", "StairStepper", "EBikeRide",
}


def _classify_session_type(activity_type: str) -> str:
    if activity_type in _STRENGTH_TYPES:
        return "strength"
    if activity_type in _CARDIO_TYPES:
        return "cardio"
    return "mixed"


def _meters_to_miles(m: float | int | None) -> float:
    if not m:
        return 0.0
    return round(float(m) / 1609.344, 2)


def _seconds_to_minutes(s: float | int | None) -> int:
    if not s:
        return 0
    return int(round(float(s) / 60.0))


def map_activity_to_workout(activity: dict) -> dict:
    """Translate a raw Strava activity dict into the shape `db.insert_strava_activity`
    accepts.

    Strava activity fields used:
      id              — used as strava_activity_id (dedupe key)
      name            — 'Morning Run'
      type            — 'Run' | 'Ride' | 'WeightTraining' | ...
      start_date_local — '2026-04-26T07:31:14Z' (already in athlete's local tz)
      moving_time     — seconds
      distance        — meters
      calories        — kcal (sometimes None, especially for weight training)
      kilojoules      — alt energy unit, common on cycling activities
                        (1 kJ ≈ 1 kcal of mechanical work for cyclists)
    """
    activity_id = str(activity.get("id") or "")
    name = (activity.get("name") or "Strava activity").strip()
    atype = activity.get("type") or "Workout"
    start_local = activity.get("start_date_local") or ""

    minutes = _seconds_to_minutes(activity.get("moving_time"))
    miles = _meters_to_miles(activity.get("distance"))
    calories = activity.get("calories")
    if not calories and activity.get("kilojoules"):
        # Cycling case: Strava reports kilojoules; rough kcal estimate.
        calories = int(round(float(activity["kilojoules"])))
    calories = int(calories or 0)

    # Build a description that reads naturally in workout history. Format:
    #   "Strava: Morning Run (5.2 mi, 42 min)"
    #   "Strava: Crossfit (45 min)"   ← when no distance
    parts = []
    if miles:
        parts.append(f"{miles} mi")
    if minutes:
        parts.append(f"{minutes} min")
    suffix = f" ({', '.join(parts)})" if parts else ""
    description = f"Strava: {name}{suffix}"

    # Pick log_date / logged_at from start_date_local. Strava sends an
    # ISO8601 string with 'Z' suffix; we just want the date portion for
    # log_date, and the full ISO for logged_at.
    log_date = ""
    logged_at = start_local
    if start_local:
        try:
            dt = datetime.fromisoformat(start_local.replace("Z", "+00:00"))
            log_date = dt.date().isoformat()
            logged_at = dt.isoformat()
        except ValueError:
            log_date = date.today().isoformat()

    return {
        "strava_activity_id": activity_id,
        "description":        description,
        "calories_burned":    calories,
        "log_date":           log_date or date.today().isoformat(),
        "logged_at":          logged_at,
        "session_type":       _classify_session_type(atype),
    }


# ── Sync orchestration ─────────────────────────────────────────────────────

def sync_user_activities(user_id: int, access_token: str, *,
                         lookback_days: int = 90) -> dict:
    """Fetch + insert recent activities for one user. Idempotent — db helper
    dedupes on strava_activity_id so re-running is safe.

    Returns: { fetched: N, inserted: M, skipped: K }
    """
    # Lazy import to avoid circular dep at module load
    from db import insert_strava_activity

    after_unix = int(time.time()) - (lookback_days * 86400)
    activities = fetch_activities(access_token, after_unix=after_unix)
    inserted = 0
    skipped = 0
    for act in activities:
        mapped = map_activity_to_workout(act)
        if not mapped["strava_activity_id"]:
            skipped += 1
            continue
        try:
            row_id = insert_strava_activity(user_id, mapped)
            if row_id:
                inserted += 1
            else:
                skipped += 1  # already existed
        except Exception as e:
            logger.warning("Strava: insert failed for activity %s: %s",
                           mapped["strava_activity_id"], e)
            skipped += 1
    logger.info("Strava sync user_id=%s: fetched=%d inserted=%d skipped=%d",
                user_id, len(activities), inserted, skipped)
    return {
        "fetched":  len(activities),
        "inserted": inserted,
        "skipped":  skipped,
    }
