"""
Garmin Connect sync — token-only auth.

Railway's server IP gets rate-limited by Garmin's OAuth endpoint when
performing full credential logins. This module never does a server-side
login. Instead it requires pre-generated OAuth tokens supplied via the
GARMIN_TOKENS environment variable (a JSON blob produced by running the
one-liner below on your LOCAL machine, which has a clean IP):

  python -c "
  from garminconnect import Garmin
  import tempfile, os, json, sys
  api = Garmin('your@email.com', 'yourpassword')
  api.login()
  d = tempfile.mkdtemp()
  api.garth.save(d)
  print(json.dumps({f: open(os.path.join(d,f)).read() for f in os.listdir(d)}))
  "

Paste the output as the GARMIN_TOKENS variable in Railway.
Tokens last ~90 days; re-run the one-liner when they expire.
"""

import os
import json
import shutil
import logging
import tempfile

logger = logging.getLogger(__name__)

DB_KEY = "garmin_oauth_tokens"

_cached_client = None


def _files_to_json(directory):
    """Read token files from a directory into a JSON string."""
    files = {}
    for fname in os.listdir(directory):
        fpath = os.path.join(directory, fname)
        if os.path.isfile(fpath):
            with open(fpath, "r") as f:
                files[fname] = f.read()
    return json.dumps(files) if files else None


def _json_to_tmpdir(token_json):
    """Write a token JSON blob to a temp directory. Caller must delete it."""
    if not token_json or not token_json.strip() or token_json.strip() == '""':
        return None
    try:
        files = json.loads(token_json)
        if not isinstance(files, dict) or not files:
            return None
        tmpdir = tempfile.mkdtemp()
        for fname, content in files.items():
            with open(os.path.join(tmpdir, fname), "w") as f:
                f.write(content)
        return tmpdir
    except Exception as e:
        logger.warning("Garmin: could not parse token JSON: %s", e)
        return None


def _build_client(token_json, label):
    """Try to build an authenticated client from a token JSON blob.
    Returns (client, token_json_possibly_refreshed) or raises on failure.
    Does NOT do any SSO/credential login.
    """
    from garminconnect import Garmin

    tmpdir = _json_to_tmpdir(token_json)
    if not tmpdir:
        raise ValueError(f"{label}: token JSON is empty or invalid")

    try:
        client = Garmin()
        client.garth.resume(tmpdir)

        # If OAuth2 expired, refresh using OAuth1 (hits oauth endpoint, not SSO)
        oauth2 = client.garth.oauth2_token
        if oauth2 is None:
            raise ValueError(f"{label}: no OAuth2 token in saved data")
        if oauth2.expired:
            logger.info("Garmin: OAuth2 expired, refreshing via OAuth1")
            client.garth.get_oauth2_token(client.garth.oauth1_token)

        # Save refreshed tokens back to DB
        fresh_json = _files_to_json(tmpdir)
        if fresh_json:
            try:
                from db import set_setting
                set_setting(DB_KEY, fresh_json)
            except Exception:
                pass

        logger.info("Garmin: authenticated via %s", label)
        return client
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


def get_client():
    """Return an authenticated Garmin client. Never does a credential login."""
    global _cached_client

    if _cached_client is not None:
        return _cached_client

    errors = []

    # 1. GARMIN_TOKENS env var (recommended — generated on local machine)
    env_tokens = os.environ.get("GARMIN_TOKENS", "").strip()
    if env_tokens:
        try:
            _cached_client = _build_client(env_tokens, "GARMIN_TOKENS env var")
            return _cached_client
        except Exception as e:
            errors.append(f"GARMIN_TOKENS: {e}")
            logger.warning("Garmin env token failed: %s", e)

    # 2. DB-persisted tokens (saved from a previous GARMIN_TOKENS load)
    try:
        from db import get_setting
        db_tokens = get_setting(DB_KEY)
    except Exception:
        db_tokens = None

    if db_tokens:
        try:
            _cached_client = _build_client(db_tokens, "DB tokens")
            return _cached_client
        except Exception as e:
            errors.append(f"DB tokens: {e}")
            logger.warning("Garmin DB token failed: %s", e)

    raise RuntimeError(
        "No valid Garmin tokens found. Set GARMIN_TOKENS in Railway environment "
        "variables. Generate tokens on your local machine — see instructions in "
        "the Garmin Connect card in the Profile tab."
    )


def invalidate():
    global _cached_client
    _cached_client = None


def fetch_day(date_str):
    """Fetch Garmin data for a local date (YYYY-MM-DD)."""
    try:
        return _fetch(date_str)
    except Exception as e:
        # If token expired mid-session, clear cache once and retry
        if any(c in str(e) for c in ("401", "403", "expired")):
            logger.info("Garmin: mid-session auth error, clearing cache")
            invalidate()
            from db import set_setting
            try:
                set_setting(DB_KEY, "")
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
        s = client.get_stats(date_str)
        result["steps"]           = int(s.get("totalSteps")         or 0)
        result["active_calories"] = int(s.get("activeKilocalories") or 0)
        result["total_calories"]  = int(s.get("totalKilocalories")  or 0)
    except Exception as e:
        logger.warning("Garmin stats (%s): %s", date_str, e)

    try:
        hr = client.get_heart_rates(date_str)
        result["resting_hr"] = hr.get("restingHeartRate") or None
    except Exception as e:
        logger.warning("Garmin HR (%s): %s", date_str, e)

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
        logger.warning("Garmin activities (%s): %s", date_str, e)

    return result


def _describe(act):
    name   = act.get("activityName", "Activity")
    dur_s  = int(act.get("duration") or 0)
    dist_m = float(act.get("distance") or 0)
    parts  = [f"[Garmin] {name}"]
    if dur_s // 60:
        parts.append(f"{dur_s // 60} min")
    if dist_m > 0:
        parts.append(f"{dist_m * 0.000621371:.2f} mi")
    return " · ".join(parts)


def _category(t):
    t = (t or "").lower()
    if any(k in t for k in ("running", "trail", "treadmill")): return "run"
    if any(k in t for k in ("cycling", "biking")):             return "bike"
    if "swim" in t:                                            return "swim"
    if any(k in t for k in ("strength", "fitness_equipment")): return "strength"
    if any(k in t for k in ("walking", "hiking")):             return "walk"
    return "other"


def is_configured():
    return bool(
        os.environ.get("GARMIN_EMAIL", "").strip() and
        os.environ.get("GARMIN_PASSWORD", "").strip()
    )
