"""
Garmin Connect sync module.

Uses the unofficial garminconnect library (which wraps garth for OAuth).
OAuth tokens are persisted in the SQLite database so a full re-login
(which hits Garmin's rate-limited OAuth endpoint) only happens once every
~90 days when tokens expire — not on every server restart or deploy.

Requires GARMIN_EMAIL and GARMIN_PASSWORD environment variables.
"""

import os
import json
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

# In-memory client cache — avoids even the token-load overhead within
# a single worker process lifetime.
_cached_client = None

SETTINGS_KEY = "garmin_oauth_tokens"


def _save_tokens(client):
    """Persist garth OAuth tokens to the DB so the next startup skips login."""
    try:
        from db import set_setting
        token_dict = client.garth.dumps()  # JSON string of OAuth tokens
        set_setting(SETTINGS_KEY, token_dict)
        logger.info("Garmin: OAuth tokens saved to DB")
    except Exception as e:
        logger.warning("Garmin: could not save tokens: %s", e)


def _load_tokens():
    """Return saved garth token JSON string from DB, or None."""
    try:
        from db import get_setting
        return get_setting(SETTINGS_KEY)
    except Exception:
        return None


def get_client():
    """Return an authenticated Garmin client.

    Priority:
      1. In-memory cache (fastest — no I/O at all)
      2. Saved OAuth tokens from DB (fast — skips the OAuth HTTP round-trip)
      3. Full credential login (slow — only when tokens are missing/expired)
    """
    global _cached_client

    if _cached_client is not None:
        return _cached_client

    from garminconnect import Garmin

    email    = os.environ.get("GARMIN_EMAIL", "").strip()
    password = os.environ.get("GARMIN_PASSWORD", "").strip()

    if not email or not password:
        raise RuntimeError(
            "GARMIN_EMAIL and GARMIN_PASSWORD environment variables are not set."
        )

    # ── Try saved tokens first (no OAuth round-trip) ──────────────────────
    token_json = _load_tokens()
    if token_json:
        try:
            client = Garmin()
            client.garth.loads(token_json)   # restore tokens into garth
            client.display_name              # lightweight check (uses saved token)
            _cached_client = client
            logger.info("Garmin: session restored from saved tokens")
            return _cached_client
        except Exception as e:
            logger.info("Garmin: saved tokens invalid/expired (%s), re-authenticating", e)
            _cached_client = None

    # ── Full login with credentials ────────────────────────────────────────
    logger.info("Garmin: performing full OAuth login")
    client = Garmin(email, password)
    client.login()
    _save_tokens(client)
    _cached_client = client
    return _cached_client


def _invalidate_cache():
    global _cached_client
    _cached_client = None


def _make_description(act):
    name    = act.get("activityName", "Activity")
    dur_s   = int(act.get("duration") or 0)
    dist_m  = float(act.get("distance") or 0)
    minutes = dur_s // 60

    parts = [f"[Garmin] {name}"]
    if minutes:
        parts.append(f"{minutes} min")
    if dist_m > 0:
        miles = dist_m * 0.000621371
        parts.append(f"{miles:.2f} mi")
    return " · ".join(parts)


def _type_to_category(atype):
    atype = (atype or "").lower()
    if any(k in atype for k in ("running", "trail", "treadmill")):
        return "run"
    if any(k in atype for k in ("cycling", "biking", "mountain_biking")):
        return "bike"
    if "swimming" in atype:
        return "swim"
    if any(k in atype for k in ("strength", "fitness_equipment")):
        return "strength"
    if any(k in atype for k in ("walking", "hiking")):
        return "walk"
    return "other"


def fetch_day(date_str):
    """Fetch all Garmin data for a given local date (YYYY-MM-DD).

    If the token is expired mid-session, clears the cache and retries once
    with a fresh login rather than surfacing the error to the user.
    """
    try:
        return _fetch_day_inner(date_str)
    except Exception as e:
        msg = str(e)
        # Token expired mid-session — clear cache and retry once
        if "401" in msg or "403" in msg or "token" in msg.lower():
            logger.info("Garmin: auth error during fetch, clearing cache and retrying")
            _invalidate_cache()
            from db import set_setting
            try:
                set_setting(SETTINGS_KEY, "")   # invalidate stored tokens
            except Exception:
                pass
            return _fetch_day_inner(date_str)
        raise


def _fetch_day_inner(date_str):
    client = get_client()
    result = {
        "date":            date_str,
        "steps":           0,
        "active_calories": 0,
        "total_calories":  0,
        "resting_hr":      None,
        "activities":      [],
    }

    try:
        stats = client.get_stats(date_str)
        result["steps"]           = int(stats.get("totalSteps")         or 0)
        result["active_calories"] = int(stats.get("activeKilocalories") or 0)
        result["total_calories"]  = int(stats.get("totalKilocalories")  or 0)
    except Exception as e:
        logger.warning("Garmin stats fetch failed for %s: %s", date_str, e)

    try:
        hr = client.get_heart_rates(date_str)
        result["resting_hr"] = hr.get("restingHeartRate") or None
    except Exception as e:
        logger.warning("Garmin HR fetch failed for %s: %s", date_str, e)

    try:
        acts = client.get_activities_by_date(date_str, date_str)
        for act in (acts or []):
            atype = (act.get("activityType") or {}).get("typeKey", "")
            result["activities"].append({
                "garmin_id":   str(act.get("activityId", "")),
                "description": _make_description(act),
                "calories":    int(act.get("calories") or 0),
                "category":    _type_to_category(atype),
            })
    except Exception as e:
        logger.warning("Garmin activities fetch failed for %s: %s", date_str, e)

    return result


def is_configured():
    return bool(
        os.environ.get("GARMIN_EMAIL", "").strip() and
        os.environ.get("GARMIN_PASSWORD", "").strip()
    )
