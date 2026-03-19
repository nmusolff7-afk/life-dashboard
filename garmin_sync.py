"""
Garmin Connect sync module.

Auth priority (highest to lowest):
  1. In-memory client cache  (zero I/O, survives within one process)
  2. GARMIN_TOKENS env var   (JSON string, set manually from local machine)
  3. DB-persisted tokens     (saved after a successful login, survives deploys)
  4. Full credential login   (hits Garmin's OAuth endpoint — rate-limited)

To avoid Railway's IP being rate-limited, generate tokens locally:

  pip install garminconnect
  python - <<'EOF'
  from garminconnect import Garmin
  api = Garmin("your@email.com", "password")
  api.login()
  import tempfile, os, json
  d = tempfile.mkdtemp()
  api.garth.save(d)
  files = {f: open(os.path.join(d,f)).read() for f in os.listdir(d)}
  print(json.dumps(files))
  EOF

Then set the printed JSON as GARMIN_TOKENS in Railway env vars.
"""

import os
import json
import shutil
import logging
import tempfile

logger = logging.getLogger(__name__)

SETTINGS_KEY = "garmin_oauth_tokens"

_cached_client = None


# ── Token persistence helpers ──────────────────────────────────────────────

def _save_tokens(client):
    """Save garth token files → JSON → DB."""
    try:
        from db import set_setting
        tmpdir = tempfile.mkdtemp()
        try:
            client.garth.save(tmpdir)
            files = {}
            for fname in os.listdir(tmpdir):
                fpath = os.path.join(tmpdir, fname)
                if os.path.isfile(fpath):
                    with open(fpath, "r") as f:
                        files[fname] = f.read()
            if files:
                set_setting(SETTINGS_KEY, json.dumps(files))
                logger.info("Garmin: tokens saved to DB (%d files)", len(files))
        finally:
            shutil.rmtree(tmpdir, ignore_errors=True)
    except Exception as e:
        logger.warning("Garmin: token save failed: %s", e)


def _token_files_from_json(token_json):
    """Write a JSON token blob to a temp dir; return dir path (caller must clean up)."""
    if not token_json or not token_json.strip():
        return None
    try:
        files = json.loads(token_json)
        if not files:
            return None
        tmpdir = tempfile.mkdtemp()
        for fname, content in files.items():
            with open(os.path.join(tmpdir, fname), "w") as f:
                f.write(content)
        return tmpdir
    except Exception as e:
        logger.warning("Garmin: failed to write token files: %s", e)
        return None


def _try_resume(token_json, source_label):
    """Try to build an authenticated Garmin client from a token JSON blob.
    Returns the client on success, None on failure.
    """
    global _cached_client
    from garminconnect import Garmin

    tmpdir = _token_files_from_json(token_json)
    if not tmpdir:
        return None
    try:
        client = Garmin()
        client.garth.resume(tmpdir)
        # Light check — raises if tokens are completely invalid
        _ = client.garth.oauth2_token
        _cached_client = client
        logger.info("Garmin: session restored from %s", source_label)
        _save_tokens(client)   # persist / refresh stored copy
        return client
    except Exception as e:
        logger.info("Garmin: %s tokens failed (%s)", source_label, e)
        return None
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


# ── Public API ─────────────────────────────────────────────────────────────

def get_client():
    """Return an authenticated Garmin client using the cheapest available path."""
    global _cached_client

    # 1. Memory cache
    if _cached_client is not None:
        return _cached_client

    from garminconnect import Garmin

    email    = os.environ.get("GARMIN_EMAIL", "").strip()
    password = os.environ.get("GARMIN_PASSWORD", "").strip()
    if not email or not password:
        raise RuntimeError("GARMIN_EMAIL and GARMIN_PASSWORD must be set.")

    # 2. GARMIN_TOKENS env var (manually seeded tokens — bypasses Railway IP rate-limit)
    env_tokens = os.environ.get("GARMIN_TOKENS", "").strip()
    if env_tokens:
        client = _try_resume(env_tokens, "GARMIN_TOKENS env var")
        if client:
            return client

    # 3. DB-persisted tokens (saved from a previous successful login)
    try:
        from db import get_setting
        db_tokens = get_setting(SETTINGS_KEY)
    except Exception:
        db_tokens = None

    if db_tokens:
        client = _try_resume(db_tokens, "DB-persisted tokens")
        if client:
            return client

    # 4. Full credential login (may be rate-limited if tried too often)
    logger.info("Garmin: no valid saved tokens — performing full OAuth login")
    client = Garmin(email, password)
    client.login()
    _save_tokens(client)
    _cached_client = client
    return client


def _invalidate():
    global _cached_client
    _cached_client = None


def fetch_day(date_str):
    """Fetch Garmin data for a local date string (YYYY-MM-DD).
    Retries once if auth fails mid-session (expired tokens).
    """
    try:
        return _fetch(date_str)
    except Exception as e:
        msg = str(e)
        if any(code in msg for code in ("401", "403", "REAUTH")):
            logger.info("Garmin: auth error, clearing cache and retrying")
            _invalidate()
            try:
                from db import set_setting
                set_setting(SETTINGS_KEY, "")
            except Exception:
                pass
            return _fetch(date_str)
        raise


def _fetch(date_str):
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
        logger.warning("Garmin stats failed (%s): %s", date_str, e)

    try:
        hr = client.get_heart_rates(date_str)
        result["resting_hr"] = hr.get("restingHeartRate") or None
    except Exception as e:
        logger.warning("Garmin HR failed (%s): %s", date_str, e)

    try:
        for act in (client.get_activities_by_date(date_str, date_str) or []):
            atype = (act.get("activityType") or {}).get("typeKey", "")
            result["activities"].append({
                "garmin_id":   str(act.get("activityId", "")),
                "description": _describe(act),
                "calories":    int(act.get("calories") or 0),
                "category":    _category(atype),
            })
    except Exception as e:
        logger.warning("Garmin activities failed (%s): %s", date_str, e)

    return result


def _describe(act):
    name    = act.get("activityName", "Activity")
    dur_s   = int(act.get("duration") or 0)
    dist_m  = float(act.get("distance") or 0)
    parts   = [f"[Garmin] {name}"]
    if dur_s // 60:
        parts.append(f"{dur_s // 60} min")
    if dist_m > 0:
        parts.append(f"{dist_m * 0.000621371:.2f} mi")
    return " · ".join(parts)


def _category(atype):
    atype = (atype or "").lower()
    if any(k in atype for k in ("running", "trail", "treadmill")):
        return "run"
    if any(k in atype for k in ("cycling", "biking")):
        return "bike"
    if "swim" in atype:
        return "swim"
    if any(k in atype for k in ("strength", "fitness_equipment")):
        return "strength"
    if any(k in atype for k in ("walking", "hiking")):
        return "walk"
    return "other"


def is_configured():
    return bool(
        os.environ.get("GARMIN_EMAIL", "").strip() and
        os.environ.get("GARMIN_PASSWORD", "").strip()
    )
