"""
Garmin Connect sync using garminconnect + garth.
"""
import logging
import os
import shutil
import threading
from datetime import date
from pathlib import Path

from garth.exc import GarthHTTPError
from garminconnect import (
    Garmin,
    GarminConnectAuthenticationError,
    GarminConnectConnectionError,
    GarminConnectTooManyRequestsError,
)

logger = logging.getLogger(__name__)

TOKEN_DIR = Path("~/.garminconnect").expanduser()

_client: Garmin | None = None
_client_lock = threading.Lock()


# ── Auth ─────────────────────────────────────────────────────────────────────

def is_configured() -> bool:
    return bool(os.getenv("GARMIN_EMAIL") and os.getenv("GARMIN_PASSWORD"))


def _init_api() -> Garmin:
    # Try stored tokens first
    try:
        garmin = Garmin()
        garmin.login(str(TOKEN_DIR))
        logger.info("Garmin: authenticated from stored tokens")
        return garmin
    except (FileNotFoundError, GarthHTTPError, GarminConnectAuthenticationError):
        pass

    # Fall back to email/password
    email    = os.getenv("GARMIN_EMAIL")
    password = os.getenv("GARMIN_PASSWORD")
    if not email or not password:
        raise RuntimeError("GARMIN_EMAIL and GARMIN_PASSWORD not set")

    garmin = Garmin(email=email, password=password, is_cn=False, return_on_mfa=True)
    result1, result2 = garmin.login()
    if result1 == "needs_mfa":
        mfa_code = input("MFA code: ")
        garmin.resume_login(result2, mfa_code)

    TOKEN_DIR.mkdir(parents=True, exist_ok=True)
    garmin.garth.dump(str(TOKEN_DIR))
    logger.info("Garmin: authenticated with email/password and saved tokens")
    return garmin


def get_client() -> Garmin:
    global _client
    with _client_lock:
        if _client is None:
            _client = _init_api()
        return _client


def _invalidate_tokens() -> None:
    global _client
    with _client_lock:
        _client = None
    if TOKEN_DIR.exists():
        shutil.rmtree(TOKEN_DIR, ignore_errors=True)
        logger.warning("Garmin: deleted token directory, will re-authenticate on next call")


def invalidate() -> None:
    _invalidate_tokens()


# ── Data fetching ─────────────────────────────────────────────────────────────

def fetch_day(date_str: str) -> dict:
    """
    Fetch Garmin data for a given date string (YYYY-MM-DD).
    Returns:
        steps, active_calories, total_calories, resting_hr,
        activities: [{garmin_activity_id, description, calories}]
    """
    client = get_client()

    summary    = client.get_user_summary(date_str)
    hr_data    = client.get_heart_rates(date_str)
    activities = client.get_activities(0, 10)  # fetch last 10 to cover the target date

    steps           = int(summary.get("totalSteps")          or 0)
    active_calories = int(summary.get("activeKilocalories")  or 0)
    total_calories  = int(summary.get("totalKilocalories")   or 0)
    resting_hr      = hr_data.get("restingHeartRate") if hr_data else None

    day_activities = []
    for act in (activities or []):
        start = (act.get("startTimeLocal") or "")[:10]
        if start != date_str:
            continue
        name      = act.get("activityName") or "Activity"
        distance  = act.get("distance") or 0
        avg_hr    = act.get("averageHR") or 0
        calories  = int(act.get("calories") or 0)
        dist_mi   = round(distance / 1609.34, 2) if distance else 0
        desc      = name
        if dist_mi:
            desc += f" · {dist_mi} mi"
        if avg_hr:
            desc += f" · {int(avg_hr)} bpm avg"
        day_activities.append({
            "garmin_activity_id": str(act.get("activityId", "")),
            "description":        desc,
            "calories":           calories,
        })

    return {
        "steps":           steps,
        "active_calories": active_calories,
        "total_calories":  total_calories,
        "resting_hr":      resting_hr,
        "activities":      day_activities,
    }


# ── Background polling thread ─────────────────────────────────────────────────

POLL_INTERVAL_SEC      = 10 * 60   # 10 minutes
RATE_LIMIT_BACKOFF_SEC = 15 * 60   # 15 minutes extra sleep on 429

_poll_thread: threading.Thread | None = None


def _poll_loop(save_fn, user_id: int) -> None:
    """
    Runs forever in a daemon thread. Calls save_fn(user_id, date_str, result)
    every POLL_INTERVAL_SEC seconds.
    """
    import time
    while True:
        try:
            today  = date.today().isoformat()
            result = fetch_day(today)
            save_fn(user_id, today, result)
            logger.info(
                "Garmin poll OK — steps=%s active_cal=%s activities=%s",
                result["steps"], result["active_calories"], len(result["activities"]),
            )
        except GarminConnectTooManyRequestsError:
            logger.warning("Garmin: rate-limited (429) — sleeping 15 min extra")
            time.sleep(RATE_LIMIT_BACKOFF_SEC)
        except (GarminConnectAuthenticationError, GarthHTTPError):
            logger.warning("Garmin: auth error — invalidating tokens and re-authenticating")
            _invalidate_tokens()
            try:
                get_client()
            except Exception as e:
                logger.error("Garmin: re-auth failed: %s", e)
        except GarminConnectConnectionError as e:
            logger.warning("Garmin: connection error: %s", e)
        except Exception as e:
            logger.error("Garmin: unexpected error: %s", e)

        time.sleep(POLL_INTERVAL_SEC)


def start_background_poll(save_fn, user_id: int = 1) -> None:
    """
    Start the background polling thread (idempotent — only one thread ever runs).
    save_fn(user_id, date_str, result) is called on each successful fetch.
    """
    global _poll_thread
    if not is_configured():
        logger.info("Garmin: credentials not set, background poll disabled")
        return
    if _poll_thread and _poll_thread.is_alive():
        return
    _poll_thread = threading.Thread(
        target=_poll_loop,
        args=(save_fn, user_id),
        daemon=True,
        name="garmin-poll",
    )
    _poll_thread.start()
    logger.info("Garmin: background poll thread started (every %d min)", POLL_INTERVAL_SEC // 60)
