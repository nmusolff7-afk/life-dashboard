"""
Garmin Connect sync module.

Uses the unofficial garminconnect library to pull daily stats and activities.
Requires GARMIN_EMAIL and GARMIN_PASSWORD environment variables.

Session tokens are cached in-memory so we don't re-login on every sync call.
On first use (or after a token expiry) a fresh login is performed.
"""

import os
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

# In-memory session cache — survives within a single Gunicorn worker process.
# Resets on dyno restart or new deployment, triggering a fresh login automatically.
_cached_client = None


def _make_description(act):
    """Build a readable workout description from a Garmin activity dict."""
    name     = act.get("activityName", "Activity")
    atype    = (act.get("activityType") or {}).get("typeKey", "")
    dur_s    = int(act.get("duration") or 0)
    dist_m   = float(act.get("distance") or 0)
    minutes  = dur_s // 60

    parts = [f"[Garmin] {name}"]
    if minutes:
        parts.append(f"{minutes} min")
    if dist_m > 0:
        miles = dist_m * 0.000621371
        parts.append(f"{miles:.2f} mi")
    return " · ".join(parts)


def _type_to_icon(atype):
    """Return a simple category string used for display."""
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


def get_client():
    """Return an authenticated Garmin client, reusing the cached session."""
    global _cached_client

    email    = os.environ.get("GARMIN_EMAIL", "").strip()
    password = os.environ.get("GARMIN_PASSWORD", "").strip()

    if not email or not password:
        raise RuntimeError(
            "GARMIN_EMAIL and GARMIN_PASSWORD environment variables are not set."
        )

    from garminconnect import Garmin, GarminConnectAuthenticationError

    if _cached_client is not None:
        try:
            # Lightweight call to verify the session is still valid
            _cached_client.get_full_name()
            return _cached_client
        except Exception:
            logger.info("Garmin session expired, re-authenticating…")
            _cached_client = None

    client = Garmin(email, password)
    client.login()
    _cached_client = client
    logger.info("Garmin login successful")
    return client


def fetch_day(date_str):
    """Fetch all Garmin data for a given local date (YYYY-MM-DD).

    Returns:
        {
          "date": "2026-03-20",
          "steps": 8432,
          "active_calories": 512,
          "total_calories": 2350,
          "resting_hr": 58,
          "activities": [
            {
              "garmin_id": "12345678",
              "description": "[Garmin] Running · 35 min · 3.80 mi",
              "calories": 380,
              "category": "run",
            },
            ...
          ]
        }
    """
    client = get_client()
    result = {
        "date":            date_str,
        "steps":           0,
        "active_calories": 0,
        "total_calories":  0,
        "resting_hr":      None,
        "activities":      [],
    }

    # ── Daily stats (steps, calories) ─────────────────────────────────────
    try:
        stats = client.get_stats(date_str)
        result["steps"]           = int(stats.get("totalSteps")           or 0)
        result["active_calories"] = int(stats.get("activeKilocalories")   or 0)
        result["total_calories"]  = int(stats.get("totalKilocalories")    or 0)
    except Exception as e:
        logger.warning("Garmin stats fetch failed for %s: %s", date_str, e)

    # ── Resting heart rate ─────────────────────────────────────────────────
    try:
        hr = client.get_heart_rates(date_str)
        result["resting_hr"] = hr.get("restingHeartRate") or None
    except Exception as e:
        logger.warning("Garmin HR fetch failed for %s: %s", date_str, e)

    # ── Activities / workouts ──────────────────────────────────────────────
    try:
        acts = client.get_activities_by_date(date_str, date_str)
        for act in (acts or []):
            atype = (act.get("activityType") or {}).get("typeKey", "")
            result["activities"].append({
                "garmin_id":   str(act.get("activityId", "")),
                "description": _make_description(act),
                "calories":    int(act.get("calories") or 0),
                "category":    _type_to_icon(atype),
            })
    except Exception as e:
        logger.warning("Garmin activities fetch failed for %s: %s", date_str, e)

    return result


def is_configured():
    return bool(
        os.environ.get("GARMIN_EMAIL", "").strip() and
        os.environ.get("GARMIN_PASSWORD", "").strip()
    )
