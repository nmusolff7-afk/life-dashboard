"""Google Calendar integration — OAuth flow + event fetch (BUILD_PLAN_v2 §3.3).

Mirrors gmail_sync.py because it uses the SAME Google OAuth project (one
Web client + one Android client + one iOS client, all reused). Difference
is purely the scope (`calendar.readonly` vs `gmail.readonly`) and the API
endpoint (Calendar API vs Gmail API). Tokens for the two integrations are
stored as separate `users_connectors` rows so the user can connect them
independently.

The user must add `https://www.googleapis.com/auth/calendar.readonly` to
their Google Cloud Console OAuth consent screen's scopes list before
this works (apps in Testing mode require explicit scope listing for any
restricted scope).
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlencode

import requests

logger = logging.getLogger(__name__)


# ── OAuth + API config (reuses Gmail's Google clients) ─────────────────────

GOOGLE_CLIENT_ID         = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET     = os.environ.get("GOOGLE_CLIENT_SECRET", "")
GOOGLE_CLIENT_ID_IOS     = os.environ.get("GOOGLE_CLIENT_ID_IOS", "")
GOOGLE_CLIENT_ID_ANDROID = os.environ.get("GOOGLE_CLIENT_ID_ANDROID", "")

GCAL_SCOPES         = "https://www.googleapis.com/auth/calendar.readonly"
GOOGLE_AUTH_URL     = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL    = "https://oauth2.googleapis.com/token"
GCAL_API_BASE       = "https://www.googleapis.com/calendar/v3"

REQUEST_TIMEOUT = 15


def is_configured() -> bool:
    """True if the Web Google OAuth client (used as fallback for desktop /
    server-side flows) is set. Native client IDs are checked separately by
    the platform-aware exchange path."""
    return bool(GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)


def _client_id_for_platform(platform: str | None) -> tuple[str, str | None]:
    """Pick the right (client_id, client_secret) pair. Native clients
    use PKCE without a secret; Web client uses secret. Same logic as
    gmail_sync._client_id_for_platform — kept duplicated so the two
    modules stay independent (one could be extracted to a shared helper
    if a third Google integration lands)."""
    p = (platform or '').lower()
    if p == 'ios' and GOOGLE_CLIENT_ID_IOS:
        return GOOGLE_CLIENT_ID_IOS, None
    if p == 'android' and GOOGLE_CLIENT_ID_ANDROID:
        return GOOGLE_CLIENT_ID_ANDROID, None
    return GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET or None


# ── OAuth helpers ───────────────────────────────────────────────────────────

def get_auth_url(redirect_uri: str, state: str = "") -> str:
    """Build the Google OAuth consent URL (Web client)."""
    params = {
        "client_id":     GOOGLE_CLIENT_ID,
        "redirect_uri":  redirect_uri,
        "response_type": "code",
        "scope":         GCAL_SCOPES,
        "access_type":   "offline",
        "prompt":        "consent",
        "state":         state,
    }
    return f"{GOOGLE_AUTH_URL}?{urlencode(params)}"


def exchange_code(code: str, redirect_uri: str, *,
                  platform: str | None = None,
                  code_verifier: str | None = None) -> dict:
    """Exchange auth code for tokens. Surfaces Google's structured error
    body on failure (matches the gmail_sync pattern)."""
    cid, csec = _client_id_for_platform(platform)
    payload: dict = {
        "code":         code,
        "client_id":    cid,
        "redirect_uri": redirect_uri,
        "grant_type":   "authorization_code",
    }
    if csec:
        payload["client_secret"] = csec
    if code_verifier:
        payload["code_verifier"] = code_verifier
    resp = requests.post(GOOGLE_TOKEN_URL, data=payload, timeout=REQUEST_TIMEOUT)
    if not resp.ok:
        try:
            err_body = resp.json()
        except Exception:
            err_body = {"raw": resp.text[:500]}
        raise RuntimeError(f"Google token endpoint {resp.status_code}: {err_body}")
    return resp.json()


def refresh_access_token(refresh_token: str, *, platform: str | None = None) -> dict:
    """Refresh an expired access token."""
    cid, csec = _client_id_for_platform(platform)
    payload: dict = {
        "refresh_token": refresh_token,
        "client_id":     cid,
        "grant_type":    "refresh_token",
    }
    if csec:
        payload["client_secret"] = csec
    resp = requests.post(GOOGLE_TOKEN_URL, data=payload, timeout=REQUEST_TIMEOUT)
    if not resp.ok:
        try:
            err_body = resp.json()
        except Exception:
            err_body = {"raw": resp.text[:500]}
        raise RuntimeError(f"Google token endpoint {resp.status_code}: {err_body}")
    return resp.json()


def compute_expiry_iso(expires_in: int) -> str:
    """ISO timestamp for token expiry (seconds-from-now → absolute)."""
    return (datetime.now(timezone.utc) + timedelta(seconds=expires_in)).isoformat()


# ── Calendar API ─────────────────────────────────────────────────────────────

def get_user_email(access_token: str) -> str:
    """The Calendar API doesn't have a /profile endpoint, but the
    'primary' calendar's id IS the user's email. Cheap to fetch and gives
    us the same external_user_id we store for Gmail."""
    resp = requests.get(
        f"{GCAL_API_BASE}/calendars/primary",
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=REQUEST_TIMEOUT,
    )
    resp.raise_for_status()
    return resp.json().get("id", "")  # primary calendar id == email


def fetch_events(access_token: str, *,
                 days_before: int = 1,
                 days_after: int = 7,
                 max_results: int = 50) -> list[dict]:
    """Fetch events in a window around today.

    Default: yesterday + next 7 days = 8 days total. Sorted by start time
    ascending (`orderBy=startTime` requires `singleEvents=true` to expand
    recurring events).

    Returns list of normalized dicts:
      { event_id, calendar_id, title, location, start, end, all_day,
        is_self_organizer, attendees_count, html_link }
    """
    now = datetime.now(timezone.utc)
    time_min = (now - timedelta(days=days_before)).isoformat()
    time_max = (now + timedelta(days=days_after)).isoformat()

    headers = {"Authorization": f"Bearer {access_token}"}
    params = {
        "timeMin":      time_min,
        "timeMax":      time_max,
        "maxResults":   max_results,
        "singleEvents": "true",
        "orderBy":      "startTime",
    }
    resp = requests.get(
        f"{GCAL_API_BASE}/calendars/primary/events",
        headers=headers,
        params=params,
        timeout=REQUEST_TIMEOUT,
    )
    resp.raise_for_status()
    raw = resp.json().get("items", [])

    out: list[dict] = []
    for ev in raw:
        if ev.get("status") == "cancelled":
            continue
        # Google returns 'date' for all-day events, 'dateTime' for timed.
        start = ev.get("start", {})
        end = ev.get("end", {})
        start_iso = start.get("dateTime") or start.get("date") or ""
        end_iso = end.get("dateTime") or end.get("date") or ""
        all_day = "date" in start and "dateTime" not in start

        out.append({
            "event_id":          ev.get("id", ""),
            "calendar_id":       ev.get("organizer", {}).get("email", "primary"),
            "title":             ev.get("summary") or "(no title)",
            "location":          ev.get("location") or "",
            "start":             start_iso,
            "end":               end_iso,
            "all_day":           all_day,
            "is_self_organizer": bool(ev.get("organizer", {}).get("self")),
            "attendees_count":   len(ev.get("attendees", []) or []),
            "html_link":         ev.get("htmlLink", ""),
        })
    return out


def filter_today_events(events: list[dict], *,
                        local_today_iso: str | None = None) -> list[dict]:
    """Return only events that overlap the user's local-today date.

    `local_today_iso` is the user's calendar date as 'YYYY-MM-DD' (passed
    by the mobile client via X-Client-Date header so we don't roll over
    at UTC midnight). Defaults to UTC today if not provided.
    """
    if not local_today_iso:
        local_today_iso = datetime.now(timezone.utc).date().isoformat()

    out: list[dict] = []
    for ev in events:
        # All-day events: start is a YYYY-MM-DD string.
        # Timed events: start is an ISO8601 datetime string.
        start = ev.get("start", "")
        if not start:
            continue
        if ev.get("all_day"):
            event_date = start[:10]
        else:
            try:
                # Strip timezone for date comparison; we trust the
                # client-passed local date as the reference.
                event_date = datetime.fromisoformat(
                    start.replace("Z", "+00:00")
                ).date().isoformat()
            except ValueError:
                continue
        if event_date == local_today_iso:
            out.append(ev)
    return out
