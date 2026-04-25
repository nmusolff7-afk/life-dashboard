from dotenv import load_dotenv
# override=True: .env is authoritative for this process, ignoring any pre-existing
# OS-level env vars. Protects against stale User/Machine-scope values on dev machines
# shadowing the real secrets.
load_dotenv(override=True)

import os
import re
import time
import threading
from datetime import date, timedelta
from functools import wraps
from typing import Optional
from flask import Flask, render_template, request, jsonify, redirect, url_for, session, send_from_directory, make_response, g
from flask_cors import CORS
import jwt
import requests
import clerk_auth
from db import (
    init_db, create_user, verify_user, delete_account,
    insert_meal, get_today_meals, get_today_totals, update_meal, delete_meal,
    insert_workout, get_today_workouts, update_workout, delete_workout, get_today_workout_burn,
    get_meal_history, get_workout_history, get_day_detail,
    get_onboarding, upsert_onboarding_inputs, complete_onboarding,
    get_profile_map, is_onboarding_complete,
    insert_mind_task, get_mind_tasks, toggle_mind_task, delete_mind_task,
    save_daily_weight, get_daily_weight,
    add_hydration_oz, get_hydration_oz, reset_hydration,
    get_ai_daily_count, incr_ai_daily_count,
    compute_momentum, get_momentum_history,
    save_gmail_tokens, get_gmail_tokens, delete_gmail_tokens, update_gmail_access_token,
    upsert_gmail_cache, get_gmail_cache, clear_gmail_cache,
    save_gmail_summary, get_gmail_summary,
    upsert_user_goal, get_user_goal,
    get_momentum_history_with_deltas, save_momentum_summary, get_momentum_summary,
    get_insight_bundle,
    save_meal, get_saved_meals, delete_saved_meal,
    save_workout, get_saved_workouts, delete_saved_workout,
    get_user_by_clerk_id, create_user_from_clerk, set_user_email_if_empty,
    list_goal_library, get_library_entry, list_user_goals, get_goal,
    count_active_goals, create_goal_from_library, update_goal_fields,
    archive_goal, unarchive_goal, mark_goal_completed,
    get_primary_fitness_goal, get_goal_progress_history,
)
import goals_engine
from claude_nutrition import estimate_nutrition, estimate_burn, parse_workout_plan, generate_workout_plan, generate_comprehensive_plan, generate_plan_understanding, revise_plan, shorten_label, scan_meal_image, generate_momentum_insight, generate_scale_summary, suggest_meal, identify_ingredients, estimate_from_barcode
from claude_profile import generate_profile_map
import gmail_sync
from goal_config import compute_targets, get_goal_config
import json
import logging as _log
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

_AI_ERR = "Something went wrong, please try again later"

app = Flask(__name__)
if os.environ.get("FLASK_ENV") == "production" or os.environ.get("RAILWAY_ENVIRONMENT") == "production":
    app.secret_key = os.environ["SECRET_KEY"]  # crash on boot if not set in production
else:
    app.secret_key = os.environ.get("SECRET_KEY") or os.urandom(32).hex()
    if not os.environ.get("SECRET_KEY"):
        _log.warning("SECRET_KEY not set — using ephemeral dev key (sessions lost on restart)")
app.permanent_session_lifetime = timedelta(days=90)
app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 86400  # cache static files 24h

# CORS — scoped to /api/* for the React Native client. Allowed origins come from CORS_ORIGINS
# (comma-separated); default covers the three Expo dev server ports.
_default_cors_origins = "http://localhost:8081,http://localhost:19000,http://localhost:19006"
_cors_origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", _default_cors_origins).split(",") if o.strip()]
CORS(app, resources={r"/api/*": {"origins": _cors_origins}}, supports_credentials=True)

# JWT — used for React Native bearer-token auth. Falls back to SECRET_KEY if JWT_SECRET unset.
JWT_SECRET = os.environ.get("JWT_SECRET") or app.secret_key
JWT_ACCESS_TTL_SECONDS = 60 * 60 * 24 * 90  # 90 days

limiter = Limiter(get_remote_address, app=app, default_limits=[], storage_uri="memory://")
init_db()


@app.route("/sw.js")
def service_worker():
    """Serve the service worker from the root so its scope covers the whole app."""
    resp = make_response(send_from_directory("static", "sw.js"))
    resp.headers["Service-Worker-Allowed"] = "/"
    resp.headers["Content-Type"] = "application/javascript"
    resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return resp


@app.template_filter("fmt_time_12h")
def fmt_time_12h(ts: str) -> str:
    """Convert 'YYYY-MM-DD HH:MM:SS' (or bare 'HH:MM') to 12-hour AM/PM string."""
    try:
        s = str(ts or "")
        # Extract HH:MM — timestamps are 'YYYY-MM-DD HH:MM:SS', bare times are 'HH:MM'
        time_part = s[11:16] if len(s) > 8 else s[:5]
        h, m = int(time_part[:2]), int(time_part[3:5])
        period = "AM" if h < 12 else "PM"
        return f"{h % 12 or 12}:{m:02d} {period}"
    except Exception as e:
        _log.warning("fmt_time_12h failed for %r: %s", ts, e)
        return str(ts or "")[11:16]

# In-memory store for async onboarding jobs: {user_id: {"status": "pending"|"done"|"error", "profile": {...}, "error": "..."}}
_ob_jobs: dict = {}
_ob_jobs_ts: dict = {}  # {user_id: time.time()} — tracks when each job was created
_ob_lock = threading.Lock()  # protects _ob_jobs and _ob_jobs_ts from concurrent access
_OB_TTL_SEC = 3600      # evict stale entries after 1 hour

_RMR_FALLBACK = 1550

def get_rmr() -> int:
    """Return the user's RMR from their profile map, falling back to _RMR_FALLBACK."""
    profile = get_profile_map(uid())
    rmr = profile.get("rmr_kcal")
    if rmr:
        return int(rmr)
    _log.warning("RMR fallback active for user %s — using %d kcal (onboarding incomplete)", uid(), _RMR_FALLBACK)
    return _RMR_FALLBACK


def is_rmr_fallback() -> bool:
    """True if the user's RMR is the generic fallback (onboarding incomplete)."""
    profile = get_profile_map(uid())
    return not profile.get("rmr_kcal")


# ── Auth helpers ────────────────────────────────────────

def issue_jwt(user_id: int) -> str:
    """Issue an HS256 JWT for bearer-token auth (React Native client)."""
    now = int(time.time())
    payload = {"sub": str(user_id), "iat": now, "exp": now + JWT_ACCESS_TTL_SECONDS}
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def verify_jwt(token: str) -> Optional[int]:
    """Verify a JWT and return the user_id, or None if invalid/expired/malformed."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        return int(payload["sub"])
    except jwt.ExpiredSignatureError:
        _log.warning("JWT verify: token expired")
        return None
    except jwt.InvalidTokenError as e:
        _log.warning("JWT verify: invalid token (%s)", type(e).__name__)
        return None
    except (KeyError, ValueError) as e:
        _log.warning("JWT verify: malformed payload (%s)", e)
        return None


def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if "user_id" in session:
            return f(*args, **kwargs)
        # Fallback: accept Bearer token for mobile clients. Resolved user_id is stashed
        # on flask.g so uid() can read it without touching session.
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            user_id = verify_jwt(auth_header[7:].strip())
            if user_id is not None:
                g.user_id = user_id
                return f(*args, **kwargs)
            # Bearer header present but invalid — return 401 instead of redirecting.
            return jsonify({"error": "Invalid or expired token."}), 401
        return redirect(url_for("login_page"))
    return decorated


def uid():
    # Prefer bearer-auth user_id from flask.g (set by login_required); fall back to session.
    if getattr(g, "user_id", None) is not None:
        return g.user_id
    return session["user_id"]


def _wants_json() -> bool:
    """True if the request is JSON or explicitly wants a JSON response."""
    if request.is_json:
        return True
    return "application/json" in request.headers.get("Accept", "")


def client_today():
    """Return today's date string in the client's local timezone.

    Precedence:
      1. ``X-Client-Date`` header (mobile — set by apiFetch on every call)
      2. ``client_date`` cookie (Flask PWA — refreshed each minute)
      3. server UTC date (final fallback)

    Both mobile and the PWA send local YYYY-MM-DD so today-queries and
    inserts always anchor to the user's calendar day, not server UTC.
    """
    h = (request.headers.get("X-Client-Date") or "").strip()
    if h:
        try:
            date.fromisoformat(h)
            return h
        except ValueError:
            pass
    d = request.cookies.get("client_date", "").strip()
    if d:
        try:
            date.fromisoformat(d)
            return d
        except ValueError:
            pass
    return date.today().isoformat()


# ── Rendering helper ────────────────────────────────────

def compute_tdee(log_date=None):
    return get_rmr() + get_today_workout_burn(uid(), log_date)


def render_index(**kwargs):
    cd           = client_today()
    meals        = get_today_meals(uid(), cd)
    totals       = get_today_totals(uid(), cd)
    workouts     = get_today_workouts(uid(), cd)
    workout_burn = get_today_workout_burn(uid(), cd)
    server_rmr   = get_rmr()
    tdee         = server_rmr + workout_burn
    profile_name = (get_profile_map(uid()).get("first_name") or "").strip()
    if not profile_name:
        ob = get_onboarding(uid())
        if ob and ob.get("raw_inputs"):
            try:
                profile_name = (json.loads(ob["raw_inputs"]).get("first_name") or "").strip()
            except Exception as e:
                _log.warning("Failed to parse profile name from raw_inputs: %s", e)
    return render_template("index.html",
        meals=meals, totals=totals, workouts=workouts, tdee=tdee,
        workout_burn=workout_burn, server_rmr=server_rmr,
        user_id=uid(), username=session.get("username", ""),
        display_name=profile_name,
        **kwargs)


# ── Auth routes ─────────────────────────────────────────

@app.route("/login", methods=["GET", "POST"])
@limiter.limit("10/minute", methods=["POST"])
def login_page():
    # Browser clients with an existing session bounce to /; JSON clients always process.
    if "user_id" in session and not _wants_json():
        return redirect(url_for("index"))
    error = None
    if request.method == "POST":
        if request.is_json:
            data = request.get_json(silent=True) or {}
            action   = (data.get("action") or "login").strip()
            username = (data.get("username") or "").strip()
            password = data.get("password") or ""
        else:
            action   = request.form.get("action")
            username = request.form.get("username", "").strip()
            password = request.form.get("password", "")
        if action == "register":
            if len(username) < 2:
                error = "Username must be at least 2 characters."
            elif len(password) < 4:
                error = "Password must be at least 4 characters."
            else:
                user_id = create_user(username, password)
                if user_id is None:
                    error = "That username is already taken."
                else:
                    session.permanent = True
                    session["user_id"]  = user_id
                    session["username"] = username.lower()
                    if _wants_json():
                        return jsonify({"ok": True, "user_id": user_id, "username": username.lower(), "token": issue_jwt(user_id)})
                    return redirect(url_for("index"))
        else:  # login
            user_id = verify_user(username, password)
            if user_id is None:
                error = "Incorrect username or password."
            else:
                session.permanent = True
                session["user_id"]  = user_id
                session["username"] = username.lower()
                if _wants_json():
                    return jsonify({"ok": True, "user_id": user_id, "username": username.lower(), "token": issue_jwt(user_id)})
                return redirect(url_for("index"))
        if _wants_json():
            return jsonify({"error": error}), 400
    return render_template("login.html", error=error)


@app.route("/api/auth/login", methods=["POST"])
@limiter.limit("10/minute")
def api_auth_login():
    """JSON-only login alias — returns {ok, user_id, username, token}."""
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    user_id = verify_user(username, password)
    if user_id is None:
        return jsonify({"error": "Incorrect username or password."}), 401
    session.permanent = True
    session["user_id"]  = user_id
    session["username"] = username.lower()
    return jsonify({"ok": True, "user_id": user_id, "username": username.lower(), "token": issue_jwt(user_id)})


@app.route("/api/auth/register", methods=["POST"])
@limiter.limit("10/minute")
def api_auth_register():
    """JSON-only registration alias — returns {ok, user_id, username, token}."""
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    if len(username) < 2:
        return jsonify({"error": "Username must be at least 2 characters."}), 400
    if len(password) < 4:
        return jsonify({"error": "Password must be at least 4 characters."}), 400
    user_id = create_user(username, password)
    if user_id is None:
        return jsonify({"error": "That username is already taken."}), 409
    session.permanent = True
    session["user_id"]  = user_id
    session["username"] = username.lower()
    return jsonify({"ok": True, "user_id": user_id, "username": username.lower(), "token": issue_jwt(user_id)})


@app.route("/api/auth/logout", methods=["POST"])
def api_auth_logout():
    """JSON-only logout alias."""
    session.clear()
    return jsonify({"ok": True})


def _fetch_clerk_user_with_retry(clerk_user_id: str, secret_key: str) -> dict | None:
    """Fetch a Clerk user record with exponential backoff on transient
    failures (5xx + network). Returns None on a non-transient failure;
    caller should fall back gracefully. Retries 3 times with 0.5s, 1s,
    2s delays — total ~3.5s worst case which is well under the bridge
    timeout on the mobile client."""
    import time
    url = f"https://api.clerk.com/v1/users/{clerk_user_id}"
    headers = {"Authorization": f"Bearer {secret_key}"}
    delays = [0.5, 1.0, 2.0]
    last_err: str | None = None
    for attempt in range(len(delays) + 1):
        try:
            resp = requests.get(url, headers=headers, timeout=10.0)
            if resp.status_code in (500, 502, 503, 504) and attempt < len(delays):
                last_err = f"Clerk API {resp.status_code}"
                time.sleep(delays[attempt])
                continue
            resp.raise_for_status()
            return resp.json()
        except requests.Timeout:
            last_err = "timeout"
            if attempt < len(delays):
                time.sleep(delays[attempt])
                continue
            break
        except requests.ConnectionError:
            last_err = "connection"
            if attempt < len(delays):
                time.sleep(delays[attempt])
                continue
            break
        except requests.RequestException as e:
            last_err = str(e)
            break
    _log.warning("Clerk API fetch failed for %s after retries: %s", clerk_user_id, last_err)
    return None


@app.route("/api/auth/clerk-verify", methods=["POST"])
@limiter.limit("20/minute")
def api_auth_clerk_verify():
    """Exchange a Clerk session token for a Flask JWT.

    Idempotent: safe to call twice for the same clerk_user_id without
    creating duplicate Flask users (race guard in
    create_user_from_clerk). Returns structured error_code so the mobile
    bridge can distinguish recoverable (clerk_api_unavailable → retry
    later) from terminal (clerk_token_invalid → sign out) failures.
    """
    data = request.get_json(silent=True) or {}
    clerk_token = (data.get("clerk_token") or "").strip()
    if not clerk_token:
        return jsonify({
            "ok": False,
            "error": "clerk_token required",
            "error_code": "missing_token",
        }), 400

    claims = clerk_auth.verify_clerk_token(clerk_token)
    if claims is None:
        return jsonify({
            "ok": False,
            "error": "Invalid Clerk token",
            "error_code": "clerk_token_invalid",
        }), 401
    clerk_user_id = claims.get("sub")
    if not clerk_user_id:
        return jsonify({
            "ok": False,
            "error": "Clerk token missing sub claim",
            "error_code": "clerk_token_invalid",
        }), 401

    existing = get_user_by_clerk_id(clerk_user_id)
    email = ""
    is_new_user = False
    if existing:
        user_id = existing["id"]
        username = existing["username"]
        email = (existing.get("email") or "").strip()
        # Backfill path: existing user without stored email (legacy row
        # created before users.email landed). Try to populate from Clerk
        # on this sign-in so the column converges to full coverage
        # without a one-shot migration. Failure here is non-fatal — the
        # user still signs in, we just try again next time.
        if not email:
            secret_key = os.environ.get("CLERK_SECRET_KEY", "")
            if secret_key:
                clerk_user = _fetch_clerk_user_with_retry(clerk_user_id, secret_key)
                if clerk_user:
                    primary_id = clerk_user.get("primary_email_address_id")
                    for ea in clerk_user.get("email_addresses", []):
                        if ea.get("id") == primary_id:
                            email = ea.get("email_address", "") or ""
                            break
                    if not email and clerk_user.get("email_addresses"):
                        email = clerk_user["email_addresses"][0].get("email_address", "") or ""
                    if email:
                        set_user_email_if_empty(user_id, email)
        _log.info(
            "clerk-verify: returning existing user_id=%s clerk=%s email_present=%s",
            user_id, clerk_user_id, bool(email),
        )
    else:
        secret_key = os.environ.get("CLERK_SECRET_KEY", "")
        if not secret_key:
            _log.error("clerk-verify: CLERK_SECRET_KEY not configured — cannot hydrate new user")
            return jsonify({
                "ok": False,
                "error": "Server Clerk config missing",
                "error_code": "server_config",
            }), 500
        clerk_user = _fetch_clerk_user_with_retry(clerk_user_id, secret_key)
        if clerk_user is None:
            return jsonify({
                "ok": False,
                "error": "Clerk API unavailable",
                "error_code": "clerk_api_unavailable",
            }), 502

        primary_id = clerk_user.get("primary_email_address_id")
        for ea in clerk_user.get("email_addresses", []):
            if ea.get("id") == primary_id:
                email = ea.get("email_address", "")
                break
        if not email and clerk_user.get("email_addresses"):
            email = clerk_user["email_addresses"][0].get("email_address", "")

        local_part = email.split("@")[0] if email else clerk_user_id[-8:]
        base_username = re.sub(r"[^a-z0-9]", "", local_part.lower()) or f"user{clerk_user_id[-8:].lower()}"
        try:
            user_id = create_user_from_clerk(clerk_user_id, email, base_username)
        except Exception:
            _log.exception("clerk-verify: create_user_from_clerk failed for clerk=%s", clerk_user_id)
            return jsonify({
                "ok": False,
                "error": "Failed to create user",
                "error_code": "db_error",
            }), 500
        linked = get_user_by_clerk_id(clerk_user_id)
        username = linked["username"] if linked else base_username
        # Email-collision path in create_user_from_clerk drops email
        # and retries, so the stored row may have NULL even though we
        # have one in hand. Backfill-on-next-signin will retry, but try
        # once here so the client response has a value.
        if linked and not (linked.get("email") or "").strip() and email:
            set_user_email_if_empty(user_id, email)
        # is_new_user is true when this request went through the
        # creation branch. A concurrent request that lost the race will
        # also see is_new_user=true here, but the mobile onboarding
        # gate only reads /api/onboarding/status — not this flag — so
        # a duplicate "new" signal doesn't cause re-onboarding.
        is_new_user = True
        _log.info(
            "clerk-verify: linked user_id=%s clerk=%s is_new=%s email_len=%d",
            user_id, clerk_user_id, is_new_user, len(email or ""),
        )

    flask_token = issue_jwt(user_id)
    return jsonify({
        "ok": True,
        "user_id": user_id,
        "username": username,
        "email": email,
        "flask_token": flask_token,
        "is_new_user": is_new_user,
    })


@app.route("/api/check-username", methods=["POST"])
@limiter.limit("10/minute")
def api_check_username():
    """Check if a username exists (for password reset flow)."""
    data = request.get_json() or {}
    username = (data.get("username") or "").strip().lower()
    if not username:
        return jsonify({"exists": False})
    from db import get_conn
    with get_conn() as conn:
        row = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
    return jsonify({"exists": row is not None})


@app.route("/api/reset-password", methods=["POST"])
@limiter.limit("5/minute")
def api_reset_password():
    """Reset a user's password — requires the server-side RECOVERY_KEY."""
    recovery_key = os.environ.get("RECOVERY_KEY", "")
    if not recovery_key:
        return jsonify({"error": "Password reset is not configured on this server."}), 403
    data = request.get_json() or {}
    provided_key = data.get("recovery_key", "")
    if not provided_key or provided_key != recovery_key:
        return jsonify({"error": "Invalid recovery key."}), 403
    username = (data.get("username") or "").strip().lower()
    new_password = data.get("new_password", "")
    if not username:
        return jsonify({"error": "Username required."}), 400
    if len(new_password) < 4:
        return jsonify({"error": "Password must be at least 4 characters."}), 400
    from db import get_conn
    from werkzeug.security import generate_password_hash
    with get_conn() as conn:
        row = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
        if not row:
            return jsonify({"error": "No account found."}), 404
        conn.execute("UPDATE users SET password_hash = ? WHERE id = ?",
                     (generate_password_hash(new_password), row["id"]))
        conn.commit()
    return jsonify({"ok": True})


@app.route("/logout", methods=["GET", "POST"])
def logout():
    session.clear()
    if _wants_json():
        return jsonify({"ok": True})
    return redirect(url_for("login_page"))


@app.route("/api/delete-account", methods=["POST"])
@login_required
def api_delete_account():
    try:
        delete_account(uid())
    except RuntimeError as e:
        _log.error("Account deletion failed for user %s: %s", uid(), e)
        return jsonify({"error": "Account deletion failed. Please contact support."}), 500
    session.clear()
    return jsonify({"ok": True})


@app.route("/api/hydration/today")
@login_required
def api_hydration_today():
    """Return today's hydration total (oz) for the authed user."""
    today = client_today()
    return jsonify({"oz": get_hydration_oz(uid(), today), "date": today})


@app.route("/api/hydration/log", methods=["POST"])
@login_required
def api_hydration_log():
    """Add N oz to today's hydration total. Body: { oz }.
    Returns the updated total."""
    data = request.get_json(silent=True) or {}
    try:
        oz = float(data.get("oz") or 0)
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid oz"}), 400
    if oz <= 0 or oz > 100:
        return jsonify({"error": "Invalid oz — must be 0 < oz <= 100"}), 400
    today = data.get("client_date") or client_today()
    add_hydration_oz(uid(), today, oz)
    return jsonify({"oz": get_hydration_oz(uid(), today), "date": today})


@app.route("/api/hydration/reset", methods=["POST"])
@login_required
def api_hydration_reset():
    """Reset today's hydration to 0 (undo)."""
    today = request.get_json(silent=True) or {}
    d = today.get("client_date") or client_today()
    reset_hydration(uid(), d)
    return jsonify({"oz": 0.0, "date": d})


@app.route("/api/log-weight", methods=["POST"])
@login_required
def api_log_weight():
    """Save daily weight and update the user's profile current_weight.
    Accepts `client_date` (mobile canonical) or `date` (legacy PWA).
    Round-to-0.1 happens client-side so the stored value matches what
    the user typed."""
    data = request.get_json() or {}
    weight = data.get("weight_lbs")
    date_str = data.get("client_date") or data.get("date") or client_today()
    if not weight or float(weight) < 30:
        return jsonify({"error": "Invalid weight"}), 400
    weight = round(float(weight), 1)
    save_daily_weight(uid(), date_str, weight)
    # Also update current_weight_lbs in the onboarding profile_map
    profile = get_profile_map(uid())
    if profile:
        profile["current_weight_lbs"] = weight
        from db import get_conn
        with get_conn() as conn:
            conn.execute(
                "UPDATE user_onboarding SET profile_map = ? WHERE user_id = ?",
                (json.dumps(profile), uid()))
            conn.commit()
    return jsonify({"ok": True})


# ── Main app ────────────────────────────────────────────

@app.route("/")
def home():
    if "user_id" in session:
        return redirect(url_for("index"))
    return render_template("home.html")


@app.route("/privacy")
def privacy():
    return render_template("privacy.html")


@app.route("/terms")
def terms():
    return render_template("terms.html")


@app.route("/app")
@login_required
def index():
    if not is_onboarding_complete(uid()):
        return redirect(url_for("onboarding"))
    return render_index()


def _lookup_username(user_id: int) -> str:
    """Look up username by id. Bearer-auth clients don't have session['username']."""
    from db import get_conn
    with get_conn() as conn:
        row = conn.execute("SELECT username FROM users WHERE id = ?", (user_id,)).fetchone()
    return row["username"] if row else ""


@app.route("/api/dashboard")
@login_required
def api_dashboard():
    """JSON dashboard payload for the React Native client (sibling of GET /)."""
    u = uid()
    profile = get_profile_map(u) or None
    if profile == {}:
        profile = None
    return jsonify({
        "user": {"id": u, "username": _lookup_username(u)},
        "profile": profile,
        "onboarding_complete": is_onboarding_complete(u),
        "goal": get_user_goal(u),
    })


# ── Onboarding ──────────────────────────────────────────

@app.route("/onboarding")
@login_required
def onboarding():
    # Allow re-entry with ?edit=1 even when onboarding is already complete
    editing = request.args.get("edit") == "1"
    if is_onboarding_complete(uid()) and not editing:
        return redirect(url_for("index"))
    row = get_onboarding(uid())
    raw = {}
    if row and row.get("raw_inputs"):
        try:
            raw = json.loads(row["raw_inputs"])
        except Exception as e:
            _log.warning("Failed to parse onboarding raw_inputs: %s", e)
    return render_template("onboarding.html",
                           username=session.get("username", ""),
                           saved=raw,
                           editing=editing)


@app.route("/api/onboarding/data")
@login_required
def api_onboarding_data():
    """JSON onboarding payload for the React Native client (sibling of GET /onboarding)."""
    u = uid()
    row = get_onboarding(u)
    saved = None
    if row and row.get("raw_inputs"):
        try:
            saved = json.loads(row["raw_inputs"])
        except Exception as e:
            _log.warning("Failed to parse onboarding raw_inputs: %s", e)
    return jsonify({
        "saved": saved,
        "completed": is_onboarding_complete(u),
        "username": _lookup_username(u),
    })


DIET_FIELDS = {
    "diet_type", "dietary_restrictions", "foods_disliked_list",
    "foods_loved_list", "allergies", "cuisine_preferences",
    "cooking_time_weeknight_min", "eats_out_per_week",
}


@app.route("/api/onboarding/save", methods=["POST"])
@login_required
def api_onboarding_save():
    """Save raw page inputs progressively (called after each page).
    If any of the diet-related fields changed, set
    profile_map_out_of_sync=1 so the UI can nudge the user to re-run
    AI profile regeneration (PRD §4.8.4). Other field edits do NOT
    flag out-of-sync — Body Stats and Daily Life recompute
    deterministically."""
    data = request.get_json() or {}
    row = get_onboarding(uid())
    existing = {}
    if row and row.get("raw_inputs"):
        try:
            existing = json.loads(row["raw_inputs"])
        except Exception as e:
            _log.warning("Failed to parse existing onboarding inputs: %s", e)

    incoming = {k: v for k, v in data.items() if v is not None}

    # Detect diet-field changes before merging so we can flag out-of-sync.
    diet_changed = False
    for k in DIET_FIELDS:
        if k in incoming and incoming[k] != existing.get(k):
            diet_changed = True
            break

    existing.update(incoming)
    upsert_onboarding_inputs(uid(), json.dumps(existing))

    if diet_changed:
        from db import get_conn
        with get_conn() as conn:
            conn.execute(
                "UPDATE user_onboarding SET profile_map_out_of_sync = 1, "
                "profile_map_out_of_sync_reason = ? WHERE user_id = ?",
                ("diet_edited", uid()),
            )
            conn.commit()
    return jsonify({"ok": True, "profile_map_out_of_sync": 1 if diet_changed else 0})


@app.route("/api/profile/sync-status")
@login_required
def api_profile_sync_status():
    row = get_onboarding(uid())
    if not row:
        return jsonify({"out_of_sync": False, "reason": None})
    return jsonify({
        "out_of_sync": bool(row.get("profile_map_out_of_sync")),
        "reason": row.get("profile_map_out_of_sync_reason"),
    })


@app.route("/api/onboarding/status")
@login_required
def api_onboarding_status():
    return jsonify({"complete": is_onboarding_complete(uid())})


@app.route("/api/profile")
@login_required
def api_profile():
    """Return key profile fields for client-side pre-filling and display."""
    p = get_profile_map(uid())
    goal = get_user_goal(uid())
    # Also read raw onboarding inputs for body stats
    ob_row = get_onboarding(uid())
    raw = {}
    if ob_row and ob_row.get("raw_inputs"):
        try:
            raw = json.loads(ob_row["raw_inputs"])
        except Exception as e:
            _log.warning("Failed to parse profile raw_inputs: %s", e)
    resp = {
        "energy_level_typical_1_10":  p.get("energy_level_typical_1_10"),
        "mood_baseline_1_10":         p.get("mood_baseline_1_10"),
        "stress_level_1_10":          p.get("stress_level_1_10"),
        "daily_calorie_goal":         p.get("daily_calorie_goal"),
        "daily_protein_goal_g":       p.get("daily_protein_goal_g"),
        "rmr_kcal":                   p.get("rmr_kcal"),
        "primary_goal":               p.get("primary_goal") or raw.get("primary_goal"),
        "steps_per_day_estimated":    p.get("steps_per_day_estimated"),
        "behavioral_archetype":       p.get("behavioral_archetype"),
        "first_name":                 p.get("first_name") or raw.get("first_name"),
        "one_sentence_summary":       p.get("one_sentence_summary"),
        "biggest_leverage_point":     p.get("biggest_leverage_point"),
        # Body stats — prefer profile_map (updated by /api/log-weight) over raw_inputs
        "current_weight_lbs":         p.get("current_weight_lbs") or raw.get("current_weight_lbs"),
        "target_weight_lbs":          raw.get("target_weight_lbs"),
        "height_ft":                  raw.get("height_ft"),
        "height_in":                  raw.get("height_in"),
        "birthday":                   raw.get("birthday"),
        "age":                        raw.get("age"),
        "gender":                     raw.get("gender"),
        "work_style":                 raw.get("work_style"),
        "body_fat_pct":               raw.get("body_fat_pct") or p.get("body_fat_pct"),
        "rmr_is_fallback":            is_rmr_fallback(),
    }
    # Include computed goal targets if available
    if goal:
        cfg = get_goal_config(goal["goal_key"])
        resp["goal_targets"] = {
            "goal_key":        goal["goal_key"],
            "goal_label":      cfg["label"],
            "calorie_target":  goal["calorie_target"],
            "protein_g":       goal["protein_g"],
            "fat_g":           goal["fat_g"],
            "carbs_g":         goal["carbs_g"],
            "deficit_surplus":  goal["deficit_surplus"],
            "rmr":             goal["rmr"],
            "sources":         cfg["sources"],
            "description":     cfg["description"],
            "rationale":       cfg["rationale"],
        }
    return jsonify(resp)


def _run_profile_generation(user_id: int, raw: dict):
    """Background thread: generate profile map and write to DB, then compute goal targets."""
    import traceback
    try:
        profile = generate_profile_map(raw)
        with app.app_context():
            complete_onboarding(user_id, json.dumps(profile))

            # ── Compute goal-driven targets from raw inputs ──
            goal_key = raw.get("primary_goal") or profile.get("primary_goal") or "lose_weight"
            cur_wt = float(raw.get("current_weight_lbs") or profile.get("current_weight_lbs") or 185)
            tgt_wt_raw = raw.get("target_weight_lbs") or profile.get("target_weight_lbs")
            tgt_wt = float(tgt_wt_raw) if tgt_wt_raw else cur_wt  # no goal weight = use current
            targets = compute_targets(
                goal_key=goal_key,
                weight_lbs=cur_wt,
                target_weight_lbs=tgt_wt,
                height_ft=int(raw.get("height_ft") or profile.get("height_ft") or 5),
                height_in=int(raw.get("height_in") or profile.get("height_in") or 10),
                age=int(raw.get("age") or profile.get("age") or 28),
                sex=raw.get("gender") or profile.get("gender") or "male",
                bf_pct=float(raw.get("body_fat_pct") or profile.get("body_fat_pct") or 0),
            )
            upsert_user_goal(
                user_id=user_id,
                goal_key=targets["goal_key"],
                calorie_target=targets["calorie_target"],
                protein_g=targets["protein_g"],
                fat_g=targets["fat_g"],
                carbs_g=targets["carbs_g"],
                deficit_surplus=targets["deficit_surplus"],
                rmr=targets["rmr"],
                rmr_method=targets["rmr_method"],
                tdee_used=targets["tdee_used"],
                config_json=json.dumps(targets["rationale"]),
                sources_json=json.dumps(targets["sources"]),
            )
            _log.info("Goal targets computed for user %s: %s → %s kcal",
                      user_id, goal_key, targets["calorie_target"])

            # Seed daily_activity with the onboarding weight so the trend chart
            # has a real baseline from day 1. Upsert keeps this idempotent if
            # the user reruns profile generation.
            try:
                save_daily_weight(user_id, date.today().isoformat(), cur_wt)
            except Exception as seed_err:
                _log.warning("weight seed for user %s failed: %s", user_id, seed_err)

            # Auto-create FIT-01 "Reach goal weight" as a unified goal so the
            # user's first Home open has a populated goal strip + Goals tab
            # that agrees with the calorie driver. Only creates it for
            # body-composition presets (lose_weight / build_muscle / recomp)
            # where the user actually has a distinct target weight — the
            # maintain preset has no target to track. Skips silently if the
            # user already has a FIT-01 (e.g., rerun of onboarding).
            # PRD §4.10.2: primary body-comp fitness goal drives calorie math.
            try:
                if goal_key in ("lose_weight", "build_muscle", "recomp") and abs(tgt_wt - cur_wt) > 0.5:
                    existing_fit01 = next(
                        (g for g in list_user_goals(user_id, statuses=["active"])
                         if g.get("library_id") == "FIT-01"),
                        None,
                    )
                    if not existing_fit01:
                        direction = "decrease" if tgt_wt < cur_wt else "increase"
                        new_goal_id = create_goal_from_library(
                            user_id=user_id,
                            library_id="FIT-01",
                            target_value=tgt_wt,
                            start_value=cur_wt,
                            direction=direction,
                            is_primary=True,
                        )
                        _log.info(
                            "Auto-created FIT-01 unified goal for user=%s goal_id=%s "
                            "(start=%.1f target=%.1f direction=%s)",
                            user_id, new_goal_id, cur_wt, tgt_wt, direction,
                        )
            except Exception as goal_err:
                # Never block onboarding completion on goal auto-creation —
                # the legacy user_goals row is the source of truth for
                # calorie math; the unified goal is a nice-to-have on the
                # Goals tab. User can add it manually later.
                _log.warning(
                    "FIT-01 auto-create for user %s skipped: %s", user_id, goal_err,
                )

        with _ob_lock:
            _ob_jobs[user_id] = {"status": "done", "profile": profile, "targets": targets}
    except Exception as e:
        tb = traceback.format_exc()
        with _ob_lock:
            _ob_jobs[user_id] = {"status": "error", "error": f"{type(e).__name__}: {e}", "traceback": tb[-800:]}


@app.route("/api/onboarding/complete", methods=["POST"])
@login_required
def api_onboarding_complete():
    """Start async profile generation — returns immediately with job queued."""
    user = uid()
    row = get_onboarding(user)
    if not row:
        return jsonify({"error": "No onboarding data found — go back to page 1 and hit Continue, then try again."}), 400

    raw = json.loads(row.get("raw_inputs") or "{}")
    # Evict stale entries older than _OB_TTL_SEC
    import time as _time_mod
    now = _time_mod.time()
    with _ob_lock:
        stale = [k for k, ts in _ob_jobs_ts.items() if now - ts > _OB_TTL_SEC]
        for uid_stale in stale:
            _ob_jobs.pop(uid_stale, None)
            _ob_jobs_ts.pop(uid_stale, None)
        _ob_jobs[user] = {"status": "pending"}
        _ob_jobs_ts[user] = now
    t = threading.Thread(target=_run_profile_generation, args=(user, raw), daemon=True)
    t.start()
    return jsonify({"queued": True})


@app.route("/api/onboarding/poll")
@login_required
def api_onboarding_poll():
    """Poll for async profile generation status."""
    user = uid()
    with _ob_lock:
        job = _ob_jobs.get(user)
    if job is None:
        # Fallback: check DB in case server restarted during generation
        if is_onboarding_complete(user):
            profile = get_profile_map(user)
            return jsonify({"status": "done", "profile": profile, "targets": {}})
        return jsonify({"status": "not_started"})
    # Pop terminal states so the entry doesn't persist forever
    if job.get("status") in ("done", "error"):
        with _ob_lock:
            _ob_jobs.pop(user, None)
            _ob_jobs_ts.pop(user, None)
    return jsonify(job)


# ── Mind tab ────────────────────────────────────────────

@app.route("/api/mind/today")
@login_required
def api_mind_today():
    # Accept explicit date from frontend (?d=YYYY-MM-DD) so the query is never
    # ambiguous — falls back to the client_date cookie, then server UTC.
    raw = request.args.get("d", "").strip()
    try:
        date.fromisoformat(raw)
        today = raw
    except (ValueError, TypeError):
        today = client_today()
    tasks    = get_mind_tasks(uid(), today)
    total    = len(tasks)
    done     = sum(1 for t in tasks if t["completed"])
    resp = jsonify({
        "date":       today,
        "tasks":      tasks,
        "checkins":   [],
        "history":    [],
        "completion": round(done / total * 100) if total else 0,
        "total":      total,
        "done":       done,
    })
    resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    return resp



@app.route("/api/mind/task", methods=["POST"])
@login_required
def api_mind_add_task():
    data = request.get_json()
    desc = (data.get("description") or "").strip()
    if not desc:
        return jsonify({"error": "description required"}), 400
    tid = insert_mind_task(uid(), desc, task_date=client_today())
    return jsonify({"id": tid, "description": desc, "completed": 0, "source": "manual"})


@app.route("/api/mind/task/<int:task_id>", methods=["PATCH"])
@login_required
def api_mind_toggle_task(task_id):
    toggle_mind_task(task_id, uid())
    return jsonify({"ok": True})


@app.route("/api/mind/task/<int:task_id>", methods=["DELETE"])
@login_required
def api_mind_delete_task(task_id):
    delete_mind_task(task_id, uid())
    return jsonify({"ok": True})


# ── Meals ───────────────────────────────────────────────



def _meal_response(cd=None):
    cd = cd or client_today()
    return jsonify({"meals": get_today_meals(uid(), cd), "totals": get_today_totals(uid(), cd)})

def _workout_response(cd=None):
    cd = cd or client_today()
    return jsonify({"workouts": get_today_workouts(uid(), cd), "burn": get_today_workout_burn(uid(), cd)})

@app.route("/api/today-nutrition")
@login_required
def api_today_nutrition():
    return _meal_response()


@app.route("/api/log-meal", methods=["POST"])
@login_required
def api_log_meal():
    data = request.get_json() or {}
    description = data.get("description", "").strip()
    if not description:
        return jsonify({"error": "No description"}), 400
    try:
        nutrition = {
            "calories":   int(data.get("calories", 0)),
            "protein_g":  float(data.get("protein_g", 0)),
            "carbs_g":    float(data.get("carbs_g", 0)),
            "fat_g":      float(data.get("fat_g", 0)),
            "sugar_g":    float(data.get("sugar_g", 0)),
            "fiber_g":    float(data.get("fiber_g", 0)),
            "sodium_mg":  float(data.get("sodium_mg", 0)),
        }
        cd = data.get("client_date") or client_today()
        ct = data.get("client_time") or None
        insert_meal(uid(), description=description, log_date=cd, logged_at=ct, **nutrition)
        return _meal_response(cd)
    except Exception as e:
        _log.exception("log-meal failed")
        return jsonify({"error": "Could not save meal. Please try again."}), 500


@app.route("/api/edit-meal/<int:meal_id>", methods=["POST"])
@login_required
def api_edit_meal(meal_id):
    data = request.get_json() or {}
    description = data.get("description", "").strip()
    if not description:
        return jsonify({"error": "No description"}), 400
    update_meal(
        meal_id, uid(),
        description=description,
        calories=int(data.get("calories", 0)),
        protein_g=float(data.get("protein_g", 0)),
        carbs_g=float(data.get("carbs_g", 0)),
        fat_g=float(data.get("fat_g", 0)),
        sugar_g=float(data.get("sugar_g", 0)),
        fiber_g=float(data.get("fiber_g", 0)),
        sodium_mg=float(data.get("sodium_mg", 0)),
    )
    return _meal_response()


@app.route("/api/delete-meal/<int:meal_id>", methods=["POST"])
@login_required
def api_delete_meal(meal_id):
    delete_meal(meal_id, uid())
    return _meal_response()


@app.route("/api/delete-workout/<int:workout_id>", methods=["POST"])
@login_required
def api_delete_workout(workout_id):
    delete_workout(workout_id, uid())
    return _workout_response()


@app.route("/api/today-workouts")
@login_required
def api_today_workouts():
    return _workout_response()


@app.route("/api/scan-meal", methods=["POST"])
@login_required
def api_scan_meal():
    """Meal photo scan. Two tiers per PRD §4.4.5:
      Standard (all tiers) — Sonnet 4.6, fast + cheap, always available.
      Premium (Pro only)   — Opus 4.6, richer portion anchoring, 20/day cap.
    Request body:
      image_b64, media_type, context, premium (bool)
    Premium=true is gated by tier (locked C2: all users are Pro during
    build cycle, so the tier check passes universally for now) and by
    the 20/day daily cap tracked in ai_daily_counts."""
    data = request.get_json() or {}
    image_b64  = data.get("image_b64", "")
    media_type = data.get("media_type", "image/jpeg")
    context    = data.get("context", "").strip()
    premium    = bool(data.get("premium", False))
    if not image_b64:
        return jsonify({"error": "No image provided"}), 400

    PREMIUM_CAP = 20  # PRD §10.3.3
    if premium:
        today = client_today()
        used = get_ai_daily_count(uid(), today, "premium_scan")
        if used >= PREMIUM_CAP:
            return jsonify({
                "error": "Premium Scan daily limit reached",
                "cap": PREMIUM_CAP,
                "reset_at": f"{today} local midnight",
            }), 402

    try:
        result = scan_meal_image(image_b64, media_type, context=context, premium=premium)
        if premium:
            incr_ai_daily_count(uid(), client_today(), "premium_scan")
        return jsonify(result)
    except Exception:
        _log.exception("scan-meal failed (premium=%s)", premium)
        return jsonify({"error": _AI_ERR}), 500


@app.route("/api/barcode/lookup-ai", methods=["POST"])
@login_required
def api_barcode_lookup_ai():
    """Haiku fallback when Open Food Facts returns no product for a
    scanned barcode. Cheap — ~$0.001/call. No daily cap at v1."""
    data = request.get_json() or {}
    barcode = (data.get("barcode") or "").strip()
    hint    = (data.get("hint") or "").strip()
    if not barcode:
        return jsonify({"error": "No barcode provided"}), 400
    try:
        return jsonify(estimate_from_barcode(barcode, hint=hint))
    except Exception:
        _log.exception("barcode/lookup-ai failed")
        return jsonify({"error": _AI_ERR}), 500


@app.route("/api/meals/scan", methods=["POST"])
@login_required
def api_meals_scan():
    """Pantry photo → ingredient list. Pro-gated per PRD §4.4.8.
    10/day cap per §10.3.12 — locked C2 says all users are Pro during
    this build cycle, so the cap is what does the gating."""
    data   = request.get_json() or {}
    images = data.get("images", [])
    if not images:
        return jsonify({"error": "No images provided"}), 400

    PANTRY_CAP = 10  # PRD §10.3.12
    today = client_today()
    used = get_ai_daily_count(uid(), today, "pantry_scan")
    if used >= PANTRY_CAP:
        return jsonify({
            "error": "Pantry Scanner daily limit reached",
            "cap": PANTRY_CAP,
            "reset_at": f"{today} local midnight",
        }), 402

    try:
        ingredients = identify_ingredients(images)
        incr_ai_daily_count(uid(), today, "pantry_scan")
        return jsonify({"ingredients": ingredients})
    except Exception:
        _log.exception("meals/scan failed")
        return jsonify({"error": _AI_ERR}), 500


@app.route("/api/meals/suggest", methods=["POST"])
@login_required
def api_meals_suggest():
    data        = request.get_json() or {}
    # PP-3b fix: accept either a pre-joined string (Flask PWA shape) or a
    # list of ingredient names (mobile shape after PantryIngredient coercion).
    # Previously calling .strip() on a list raised AttributeError → 500.
    raw_ingredients = data.get("ingredients", "")
    if isinstance(raw_ingredients, list):
        ingredients = ", ".join(str(x).strip() for x in raw_ingredients if x).strip()
    else:
        ingredients = str(raw_ingredients or "").strip()
    images      = data.get("images", [])      # [{b64, media_type}]
    hour        = data.get("hour")             # 0-23, client local hour
    cal_consumed = data.get("calories_consumed", 0) or 0

    # Determine meal type from hour
    if hour is None:
        from datetime import datetime
        hour = datetime.now().hour
    if hour < 10:
        meal_type = "breakfast"
    elif hour < 14:
        meal_type = "lunch"
    elif hour < 17:
        meal_type = "snack"
    else:
        meal_type = "dinner"

    # Always fetch fresh consumed + target from DB (don't trust stale client globals)
    totals = get_today_totals(uid(), client_today())
    cal_consumed = int((totals or {}).get("total_calories", 0) or 0)
    goal = get_user_goal(uid())
    cal_target = goal["calorie_target"] if goal and goal["calorie_target"] > 0 else 2000
    cal_remaining = max(100, cal_target - cal_consumed)  # floor at 100 — always suggest something
    _log.info("SUGGEST: user=%s cal_target=%s cal_consumed=%s cal_remaining=%s",
              uid(), cal_target, cal_consumed, cal_remaining)

    try:
        result = suggest_meal(
            ingredients=ingredients,
            images=images[:6],
            calories_remaining=cal_remaining,
            meal_type=meal_type,
        )
        result["meal_type"]      = meal_type
        result["cal_remaining"]  = cal_remaining
        return jsonify(result)
    except Exception as e:
        _log.exception("meals/suggest failed")
        return jsonify({"error": _AI_ERR}), 500


@app.route("/api/estimate", methods=["POST"])
@login_required
def api_estimate():
    data = request.get_json()
    description = (data or {}).get("description", "").strip()
    if not description:
        return jsonify({"error": "No description provided"}), 400
    _log.info("estimate: user=%s len=%d words=%d", uid(), len(description), len(description.split()))
    try:
        return jsonify(estimate_nutrition(description, profile_map=get_profile_map(uid())))
    except Exception as e:
        _log.exception("estimate failed for %d-char input", len(description))
        return jsonify({"error": _AI_ERR}), 500


# ── Workouts ────────────────────────────────────────────

@app.route("/api/burn-estimate", methods=["POST"])
@login_required
def api_burn_estimate():
    data = request.get_json()
    description = (data or {}).get("description", "").strip()
    if not description:
        return jsonify({"error": "No description provided"}), 400
    _log.info("burn-estimate: user=%s len=%d words=%d", uid(), len(description), len(description.split()))
    try:
        return jsonify(estimate_burn(description, profile_map=get_profile_map(uid())))
    except Exception as e:
        _log.exception("burn-estimate failed for %d-char input", len(description))
        return jsonify({"error": _AI_ERR}), 500


@app.route("/api/log-workout", methods=["POST"])
@login_required
def api_log_workout():
    data = request.get_json() or {}
    description     = data.get("description", "").strip()
    calories_burned = int(data.get("calories_burned", 0) or 0)
    if not description:
        return jsonify({"error": "No description"}), 400
    cd = data.get("client_date") or client_today()
    ct = data.get("client_time") or None
    st = (data.get("session_type") or "").strip().lower() or None
    if st not in (None, "strength", "cardio", "mixed"):
        st = None  # ignore unexpected values instead of rejecting the log
    insert_workout(uid(), description, calories_burned, log_date=cd, logged_at=ct, session_type=st)
    return jsonify({"ok": True})


@app.route("/api/shorten", methods=["POST"])
@login_required
def api_shorten():
    data = request.get_json()
    description = (data or {}).get("description", "").strip()
    if not description:
        return jsonify({"label": description})
    try:
        return jsonify({"label": shorten_label(description)})
    except Exception as e:
        _log.warning("shorten_label failed, using original: %s", e)
        return jsonify({"label": description})


@app.route("/api/day/<date_str>")
@login_required
def api_day(date_str):
    detail = get_day_detail(uid(), date_str)
    detail["sleep"]  = None
    detail["garmin"] = None
    return jsonify(detail)


@app.route("/api/edit-workout/<int:workout_id>", methods=["POST"])
@login_required
def api_edit_workout(workout_id):
    data = request.get_json() or {}
    description = data.get("description", "").strip()
    if not description:
        return jsonify({"error": "No description"}), 400
    update_workout(workout_id, uid(), description, int(data.get("calories_burned", 0) or 0))
    return jsonify({"ok": True})


# ── Saved Meals ────────────────────────────────────────

@app.route("/api/saved-meals")
@login_required
def api_saved_meals():
    return jsonify(get_saved_meals(uid()))


@app.route("/api/saved-meals", methods=["POST"])
@login_required
def api_save_meal():
    data = request.get_json() or {}
    description = data.get("description", "").strip()
    if not description:
        return jsonify({"error": "No description"}), 400
    import json
    save_meal(
        uid(), description,
        calories=int(data.get("calories", 0)),
        protein_g=float(data.get("protein_g", 0)),
        carbs_g=float(data.get("carbs_g", 0)),
        fat_g=float(data.get("fat_g", 0)),
        sugar_g=float(data.get("sugar_g", 0)),
        fiber_g=float(data.get("fiber_g", 0)),
        sodium_mg=float(data.get("sodium_mg", 0)),
        items_json=json.dumps(data.get("items", [])),
    )
    return jsonify({"ok": True})


@app.route("/api/saved-meals/<int:saved_id>", methods=["DELETE"])
@login_required
def api_delete_saved_meal(saved_id):
    delete_saved_meal(saved_id, uid())
    return jsonify({"ok": True})


# ── Saved Workouts ─────────────────────────────────────

@app.route("/api/saved-workouts")
@login_required
def api_saved_workouts():
    return jsonify(get_saved_workouts(uid()))


@app.route("/api/saved-workouts", methods=["POST"])
@login_required
def api_save_workout():
    data = request.get_json() or {}
    description = data.get("description", "").strip()
    if not description:
        return jsonify({"error": "No description"}), 400
    save_workout(uid(), description, int(data.get("calories_burned", 0)))
    return jsonify({"ok": True})


@app.route("/api/saved-workouts/<int:saved_id>", methods=["DELETE"])
@login_required
def api_delete_saved_workout(saved_id):
    delete_saved_workout(saved_id, uid())
    return jsonify({"ok": True})


# ── AI Edit (re-estimate with modifications) ───────────

@app.route("/api/ai-edit-meal", methods=["POST"])
@login_required
def api_ai_edit_meal():
    """Takes original description + user edit instructions, returns new nutrition estimate."""
    data = request.get_json() or {}
    original = data.get("original", "").strip()
    edits = data.get("edits", "").strip()
    if not original or not edits:
        return jsonify({"error": "Need original and edits"}), 400
    combined = f"{original}\n\nUser correction: {edits}"
    try:
        return jsonify(estimate_nutrition(combined, profile_map=get_profile_map(uid())))
    except Exception as e:
        _log.exception("ai-edit-meal failed")
        return jsonify({"error": _AI_ERR}), 500


@app.route("/api/ai-edit-workout", methods=["POST"])
@login_required
def api_ai_edit_workout():
    """Takes original description + user edit instructions, returns new burn estimate."""
    data = request.get_json() or {}
    original = data.get("original", "").strip()
    edits = data.get("edits", "").strip()
    if not original or not edits:
        return jsonify({"error": "Need original and edits"}), 400
    combined = f"{original}\n\nUser correction: {edits}"
    try:
        return jsonify(estimate_burn(combined, profile_map=get_profile_map(uid())))
    except Exception as e:
        _log.exception("ai-edit-workout failed")
        return jsonify({"error": _AI_ERR}), 500


@app.route("/api/history")
@login_required
def api_history():
    momentum_rows = get_momentum_history(uid(), 90)
    momentum = {r["score_date"]: r["momentum_score"] for r in momentum_rows}
    return jsonify({
        "meals":    get_meal_history(uid(), 90),
        "workouts": get_workout_history(uid(), 90),
        "briefs":   {},
        "sleep":    {},
        "momentum": momentum,
        "garmin":   {},
    })


@app.route("/api/parse-workout-plan", methods=["POST"])
@login_required
def api_parse_workout_plan():
    data = request.get_json()
    text = (data or {}).get("text", "").strip()
    if not text:
        return jsonify({"error": "No text provided"}), 400
    try:
        return jsonify(parse_workout_plan(text))
    except Exception as e:
        _log.exception("parse-workout-plan failed")
        return jsonify({"error": _AI_ERR}), 500


@app.route("/api/generate-plan", methods=["POST"])
@login_required
def api_generate_plan():
    """Generate a simple workout plan based on goal and preferences."""
    data = request.get_json() or {}
    goal       = data.get("goal", "lose_weight")
    days       = int(data.get("days_per_week", 3))
    experience = data.get("experience", "beginner")
    try:
        plan = generate_workout_plan(goal, days, experience)
        return jsonify(plan)
    except Exception as e:
        _log.exception("generate-plan failed")
        return jsonify({"error": _AI_ERR}), 500


@app.route("/api/generate-comprehensive-plan", methods=["POST"])
@login_required
def api_generate_comprehensive_plan():
    """Generate a full strength + cardio plan from the workout builder quiz payload."""
    payload = request.get_json() or {}
    try:
        plan = generate_comprehensive_plan(payload)
    except Exception as e:
        _log.exception("comprehensive-plan generation failed")
        return jsonify({"error": _AI_ERR}), 500
    try:
        understanding = generate_plan_understanding(payload)
    except Exception as e:
        _log.warning("plan understanding generation failed, continuing without it: %s", e)
        understanding = ""
    return jsonify({"plan": plan, "understanding": understanding})


@app.route("/api/revise-plan", methods=["POST"])
@login_required
def api_revise_plan():
    """Revise an existing plan based on user feedback."""
    data = request.get_json() or {}
    payload = data.get("payload", {})
    current_plan = data.get("currentPlan", {})
    change_request = data.get("changeRequest", "").strip()
    if not change_request:
        return jsonify({"error": "No change request provided"}), 400
    try:
        revised = revise_plan(payload, current_plan, change_request)
        return jsonify({"plan": revised})
    except Exception as e:
        _log.exception("plan-revision failed")
        return jsonify({"error": _AI_ERR}), 500


# ── Workout plan CRUD (Phase 12) ───────────────────────

@app.route("/api/workout-plan", methods=["GET"])
@login_required
def api_workout_plan_get():
    """Return the user's currently active workout plan, or 204 if none."""
    from db import get_active_workout_plan
    plan = get_active_workout_plan(uid())
    if not plan:
        return ("", 204)
    return jsonify(plan)


@app.route("/api/workout-plan/save", methods=["POST"])
@login_required
def api_workout_plan_save():
    """Save a directly-provided plan as active. Body:
      { plan, quiz_payload?, understanding?, sources? }"""
    from db import get_active_workout_plan, save_active_workout_plan
    data = request.get_json() or {}
    plan = data.get("plan")
    if not isinstance(plan, dict):
        return jsonify({"error": "Missing plan body"}), 400
    save_active_workout_plan(
        uid(),
        plan,
        quiz_payload=data.get("quiz_payload"),
        understanding=data.get("understanding"),
        sources=data.get("sources"),
    )
    return jsonify(get_active_workout_plan(uid()) or {}), 201


@app.route("/api/workout-plan/generate", methods=["POST"])
@login_required
def api_workout_plan_generate():
    """Generate a fresh plan from the builder quiz payload and save it
    as the user's active plan. Archives any previous active plan.
    Payload also carries a `scientificSources` array the client
    pre-computed from the quiz answers — persisted verbatim so the
    "How we built your plan" panel can render the same citations the
    AI was told to honor.

    Returns the newly saved plan row. On AI failure we return the real
    error message rather than a generic _AI_ERR so the client can show
    something diagnostic."""
    from db import get_active_workout_plan, save_active_workout_plan
    payload = request.get_json() or {}
    sources = payload.get("scientificSources") or []
    try:
        plan = generate_comprehensive_plan(payload)
    except Exception as e:
        _log.exception("workout-plan/generate AI call failed")
        return jsonify({
            "error": str(e) or _AI_ERR,
            "hint": "Plan generation failed. Check server logs for JSON parse errors.",
        }), 500
    try:
        understanding = generate_plan_understanding(payload)
    except Exception:
        _log.warning("understanding generation failed; saving plan without it")
        understanding = ""
    save_active_workout_plan(
        uid(),
        {
            "weeklyPlan": plan.get("weeklyPlan") or plan,
            "planNotes": plan.get("planNotes"),
        },
        quiz_payload=payload,
        understanding=understanding,
        sources=sources if isinstance(sources, list) else [],
    )
    out = get_active_workout_plan(uid())
    return jsonify(out or {}), 201


@app.route("/api/workout-plan/revise", methods=["POST"])
@login_required
def api_workout_plan_revise():
    """Revise the user's active plan in place. Body:
      { change_request: str } — the user's natural-language feedback.
    Uses the stored quiz_payload + current plan_json as AI context. """
    from db import get_active_workout_plan, save_active_workout_plan
    data = request.get_json() or {}
    change_request = (data.get("change_request") or "").strip()
    if not change_request:
        return jsonify({"error": "Missing change_request"}), 400
    current = get_active_workout_plan(uid())
    if not current:
        return jsonify({"error": "No active plan to revise"}), 404
    try:
        revised = revise_plan(
            current.get("quiz_payload") or {},
            current.get("plan") or {},
            change_request,
        )
    except Exception:
        _log.exception("workout-plan/revise AI call failed")
        return jsonify({"error": _AI_ERR}), 500
    save_active_workout_plan(
        uid(),
        revised,
        quiz_payload=current.get("quiz_payload"),
        understanding=current.get("understanding"),
    )
    return jsonify(get_active_workout_plan(uid()) or {})


@app.route("/api/workout-plan", methods=["PATCH"])
@login_required
def api_workout_plan_patch():
    """Apply manual edits (exercise swap, set/rep change, add/remove).
    Body: { plan: <full plan dict, including weeklyPlan + planNotes> }."""
    from db import get_active_workout_plan, patch_active_workout_plan
    data = request.get_json() or {}
    plan = data.get("plan")
    if not isinstance(plan, dict):
        return jsonify({"error": "Missing plan body"}), 400
    ok = patch_active_workout_plan(uid(), plan)
    if not ok:
        return jsonify({"error": "No active plan to edit"}), 404
    return jsonify(get_active_workout_plan(uid()) or {})


@app.route("/api/workout-plan", methods=["DELETE"])
@login_required
def api_workout_plan_delete():
    """Deactivate the active plan. Does NOT delete the row — archived
    for potential later reactivation."""
    from db import deactivate_workout_plan
    ok = deactivate_workout_plan(uid())
    return jsonify({"deactivated": ok})


# ── Gmail ──────────────────────────────────────────────

@app.route("/api/gmail/status")
@login_required
def api_gmail_status():
    """Return Gmail connection status and cached summary for today."""
    tokens = get_gmail_tokens(uid())
    connected = tokens is not None
    today = client_today()
    summary = get_gmail_summary(uid(), today) if connected else None
    cached = get_gmail_cache(uid(), limit=100) if connected else []
    # Split by importance — score every cached email
    from db import get_importance_rules, score_email_importance
    rules = get_importance_rules(uid()) if connected else {}
    for e in cached:
        e["importance_score"] = score_email_importance(e.get("sender", ""), rules) if rules else 0
    important = [e for e in cached if e.get("importance_score", 0) > 0][:20]
    stream = [e for e in cached if e.get("importance_score", 0) == 0][:20]  # unlabeled only, cap at 20
    return jsonify({
        "configured": gmail_sync.is_configured(),
        "connected":  connected,
        "email":      tokens.get("email_address", "") if tokens else "",
        "summary":    summary,
        "emails":     cached,
        "important":  important,
        "stream":     stream,
    })


def _gmail_redirect_uri():
    """Build the Gmail OAuth redirect URI, respecting reverse proxies."""
    app_url = os.environ.get("APP_URL", "").rstrip("/")
    if app_url:
        return app_url + "/api/gmail/callback"
    # Fall back to request-based detection with proxy header support
    scheme = request.headers.get("X-Forwarded-Proto", request.scheme)
    host   = request.headers.get("X-Forwarded-Host", request.host)
    return f"{scheme}://{host}/api/gmail/callback"


@app.route("/api/gmail/debug")
@login_required
def api_gmail_debug():
    """Debug endpoint — shows what redirect URI the app would use."""
    return jsonify({
        "redirect_uri": _gmail_redirect_uri(),
        "request_url_root": request.url_root,
        "request_scheme": request.scheme,
        "request_host": request.host,
        "x_forwarded_proto": request.headers.get("X-Forwarded-Proto", ""),
        "x_forwarded_host": request.headers.get("X-Forwarded-Host", ""),
        "APP_URL": os.environ.get("APP_URL", ""),
    })


@app.route("/api/gmail/connect")
@login_required
def api_gmail_connect():
    """Start Gmail OAuth. Browsers get a 302 to Google; JSON clients get {auth_url}."""
    if not gmail_sync.is_configured():
        return jsonify({"error": "Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET."}), 400
    import secrets
    oauth_state = secrets.token_urlsafe(32)
    session["gmail_oauth_state"] = oauth_state
    redirect_uri = _gmail_redirect_uri()
    auth_url = gmail_sync.get_auth_url(redirect_uri, state=oauth_state)
    if _wants_json():
        return jsonify({"auth_url": auth_url})
    return redirect(auth_url)


@app.route("/api/gmail/callback")
@login_required
def api_gmail_callback():
    """Handle OAuth callback from Google. Browser path redirects; JSON path returns {ok, email}."""
    json_mode = _wants_json()
    error = request.args.get("error")
    if error:
        if json_mode:
            return jsonify({"error": error}), 400
        from urllib.parse import urlencode
        return redirect(url_for("index") + "?" + urlencode({"gmail_error": error}))

    returned_state = request.args.get("state", "")
    expected_state = session.pop("gmail_oauth_state", None)
    if not expected_state or returned_state != expected_state:
        if json_mode:
            return jsonify({"error": "invalid_state"}), 400
        return redirect(url_for("index") + "?gmail_error=invalid_state")

    code = request.args.get("code", "")
    if not code:
        if json_mode:
            return jsonify({"error": "no_code"}), 400
        return redirect(url_for("index") + "?gmail_error=no_code")

    redirect_uri = _gmail_redirect_uri()
    try:
        token_data = gmail_sync.exchange_code(code, redirect_uri)
        access_token  = token_data["access_token"]
        refresh_token = token_data.get("refresh_token", "")
        expires_in    = token_data.get("expires_in", 3600)
        token_expiry  = gmail_sync.compute_expiry(expires_in)

        email_address = gmail_sync.get_user_email(access_token)
        save_gmail_tokens(uid(), access_token, refresh_token, token_expiry, email_address)
        _log.info("Gmail: connected for user %s (%s)", uid(), email_address)
        if json_mode:
            return jsonify({"ok": True, "email": email_address})
        return redirect(url_for("index") + "?gmail_connected=1#tab-mind")
    except Exception as e:
        _log.exception("Gmail OAuth callback failed")
        if json_mode:
            return jsonify({"error": "auth_failed"}), 502
        return redirect(url_for("index") + "?gmail_error=auth_failed")


@app.route("/api/gmail/disconnect", methods=["POST"])
@login_required
def api_gmail_disconnect():
    """Disconnect Gmail — delete tokens and cached data."""
    delete_gmail_tokens(uid())
    return jsonify({"ok": True})


@app.route("/api/gmail/sync", methods=["POST"])
@login_required
def api_gmail_sync():
    """Fetch recent emails, cache them, and generate an AI summary."""
    access_token = gmail_sync.get_valid_token(
        uid(), get_gmail_tokens, update_gmail_access_token
    )
    if not access_token:
        return jsonify({"error": "Gmail not connected or token expired. Please reconnect."}), 401

    try:
        emails = gmail_sync.fetch_recent_emails(access_token, max_results=20)
    except Exception as e:
        _log.exception("Gmail: fetch failed")
        return jsonify({"error": "Failed to fetch emails. Please try again."}), 502

    # Log subjects for debugging
    for e in emails[:3]:
        _log.info("Gmail email: sender=%s subject=%s", e.get("sender","?")[:30], e.get("subject","?")[:50])

    # Cache emails (upsert — don't clear, let the pool grow)
    for e in emails:
        upsert_gmail_cache(
            uid(), e["thread_id"], e["message_id"],
            e["sender"], e["subject"], e["snippet"],
            e["received_at"], e["has_replied"], e["is_read"],
        )

    # Score importance for all cached emails
    from db import update_email_importance_scores, get_importance_rules, score_email_importance
    update_email_importance_scores(uid())
    rules = get_importance_rules(uid())
    for e in emails:
        e["importance_score"] = score_email_importance(e["sender"], rules)

    # Split: important (positive), stream (unlabeled only), dismissed (negative) hidden
    important = [e for e in emails if e.get("importance_score", 0) > 0][:20]
    stream = [e for e in emails if e.get("importance_score", 0) == 0][:20]

    # AI summary only for important emails
    summary_text = ""
    if important:
        summary_text = gmail_sync.summarize_emails(important)
        save_gmail_summary(uid(), client_today(), summary_text, len(important), 0)
    elif emails:
        summary_text = "No important emails yet. Mark senders as important in the Stream tab."

    return jsonify({
        "emails":     emails,
        "important":  important,
        "stream":     stream,
        "summary":    {"summary_text": summary_text, "email_count": len(important)},
    })


@app.route("/api/gmail/label", methods=["POST"])
@login_required
def api_gmail_label():
    """Mark an email sender as important or unimportant."""
    from db import label_email_importance, update_email_importance_scores
    data = request.get_json() or {}
    sender = data.get("sender", "").strip()
    label = data.get("label", "")  # "important" or "unimportant"
    if not sender or label not in ("important", "unimportant"):
        return jsonify({"error": "sender and label (important/unimportant) required"}), 400
    label_email_importance(uid(), sender, label)
    update_email_importance_scores(uid())
    return jsonify({"ok": True})


# ── Chatbot (PRD §4.7) ──────────────────────────────────
# Buffered (non-SSE) chatbot endpoint per locked C3. Builds 9 typed
# context containers (Profile/Goals/Nutrition/Fitness real; Finance/Life
# null placeholders at this phase), calls Haiku, returns the response
# synchronously. Audit row persisted per C1 — names-only.

@app.route("/api/chatbot/query", methods=["POST"])
@login_required
def api_chatbot_query():
    import chatbot as _cb
    data = request.get_json(silent=True) or {}
    query = (data.get("query") or "").strip()
    if not query:
        return jsonify({"error": "Empty query"}), 400
    if len(query) > 2000:
        return jsonify({"error": "Query too long (max 2000 characters)"}), 400
    history = data.get("conversation_history") or []
    surface = data.get("surface")
    session_id = data.get("session_id") or ""
    try:
        result = _cb.answer_query(
            user_id=uid(),
            query=query,
            conversation_history=history,
            surface=surface,
            session_id=session_id,
        )
        return jsonify(result)
    except Exception:
        _log.exception("chatbot/query failed")
        return jsonify({"error": "Chatbot temporarily unavailable"}), 500


@app.route("/api/chatbot/audit")
@login_required
def api_chatbot_audit_list():
    import chatbot as _cb
    try:
        limit = min(int(request.args.get("limit", 50)), 200)
    except (TypeError, ValueError):
        limit = 50
    return jsonify({"rows": _cb.list_audit(uid(), limit=limit)})


@app.route("/api/chatbot/audit/<int:audit_id>", methods=["DELETE"])
@login_required
def api_chatbot_audit_delete(audit_id):
    import chatbot as _cb
    ok = _cb.delete_audit_row(uid(), audit_id)
    return jsonify({"ok": ok})


@app.route("/api/chatbot/audit/export")
@login_required
def api_chatbot_audit_export():
    """GDPR Article 15 compliance — user's full chatbot audit as JSON."""
    import chatbot as _cb
    rows = _cb.list_audit(uid(), limit=10000)
    return jsonify({"user_id": uid(), "exported_at": datetime.now().isoformat(), "rows": rows})


# ── Scoring (PRD §9) ────────────────────────────────────
# Deterministic category + overall scoring. Replaces the legacy momentum
# system for mobile clients. /api/momentum/* below stays live for the
# Flask PWA until that surface is decommissioned.

@app.route("/api/score/overall")
@login_required
def api_score_overall():
    import scoring as _scoring
    as_of = request.args.get("date") or client_today()
    try:
        data = _scoring.compute_overall_score(uid(), as_of)
        # Cache today's row in daily_scores (fire-and-forget; non-fatal on error)
        try:
            _scoring.snapshot_scores(uid(), as_of)
        except Exception as snap_err:
            _log.warning("snapshot_scores failed for user %s: %s", uid(), snap_err)
        return jsonify(data)
    except Exception as e:
        _log.exception("score/overall failed for user %s", uid())
        return jsonify({"error": "Score computation failed", "detail": str(e)}), 500


@app.route("/api/score/fitness")
@login_required
def api_score_fitness():
    import scoring as _scoring
    as_of = request.args.get("date") or client_today()
    try:
        return jsonify(_scoring.compute_fitness_score(uid(), as_of).as_dict())
    except Exception:
        _log.exception("score/fitness failed for user %s", uid())
        return jsonify({"error": "Score computation failed"}), 500


@app.route("/api/score/nutrition")
@login_required
def api_score_nutrition():
    import scoring as _scoring
    as_of = request.args.get("date") or client_today()
    try:
        return jsonify(_scoring.compute_nutrition_score(uid(), as_of).as_dict())
    except Exception:
        _log.exception("score/nutrition failed for user %s", uid())
        return jsonify({"error": "Score computation failed"}), 500


@app.route("/api/score/finance")
@login_required
def api_score_finance():
    import scoring as _scoring
    as_of = request.args.get("date") or client_today()
    return jsonify(_scoring.compute_finance_score(uid(), as_of).as_dict())


@app.route("/api/score/time")
@login_required
def api_score_time():
    import scoring as _scoring
    as_of = request.args.get("date") or client_today()
    return jsonify(_scoring.compute_time_score(uid(), as_of).as_dict())


# ── Momentum ─────────────────────────────────────────────

@app.route("/api/momentum/today", methods=["GET", "POST"])
@login_required
def api_momentum_today():
    today = client_today()
    body  = request.get_json(silent=True) or {}
    calorie_goal = body.get("calorie_goal") or None
    if calorie_goal:
        try:
            calorie_goal = int(calorie_goal)
        except (TypeError, ValueError):
            calorie_goal = None
    hour = body.get("hour")
    try:
        hour = int(hour) if hour is not None else None
    except (TypeError, ValueError):
        hour = None
    planned_workout = body.get("planned_workout_today")
    if planned_workout is not None:
        planned_workout = bool(planned_workout)
    client_tdee = int(body.get("tdee") or 0) or None
    client_target = int(body.get("target_intake") or 0) or None
    try:
        breakdown = compute_momentum(uid(), today, calorie_goal_override=calorie_goal, hour=hour,
                                     planned_workout_today=planned_workout, client_tdee=client_tdee,
                                     client_target_intake=client_target)
        return jsonify(breakdown)
    except Exception as e:
        _log.exception("momentum/today failed")
        return jsonify({"error": "Could not compute score. Please try again."}), 500


@app.route("/api/momentum/history")
@login_required
def api_momentum_history():
    days = int(request.args.get("days", 14))
    return jsonify(get_momentum_history(uid(), days))


@app.route("/api/logged-dates")
@login_required
def api_logged_dates():
    """Return sorted ISO dates where the user logged at least one meal or
    workout, within the last N days (default 90). Used by the mobile StreakBar
    as the authoritative 'did the user show up today' signal."""
    days = int(request.args.get("days", 90))
    cutoff = (date.today() - timedelta(days=days)).isoformat()
    from db import get_conn
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT log_date FROM meal_logs    WHERE user_id = ? AND log_date >= ?
            UNION
            SELECT log_date FROM workout_logs WHERE user_id = ? AND log_date >= ?
            ORDER BY log_date
            """,
            (uid(), cutoff, uid(), cutoff),
        ).fetchall()
    return jsonify([r["log_date"] for r in rows])


@app.route("/api/workout-history")
@login_required
def api_workout_history():
    """Individual workout rows within the last N days, newest first.
    Unlike /api/history's grouped workouts, this keeps ids + logged_at so the
    mobile History list can offer tap-to-edit / delete on each entry."""
    days = int(request.args.get("days", 90))
    cutoff = (date.today() - timedelta(days=days)).isoformat()
    from db import get_conn
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT id, user_id, log_date, logged_at, description, calories_burned
            FROM workout_logs
            WHERE user_id = ? AND log_date >= ?
            ORDER BY log_date DESC, logged_at DESC, id DESC
            """,
            (uid(), cutoff),
        ).fetchall()
    return jsonify([dict(r) for r in rows])


@app.route("/api/meal-history")
@login_required
def api_meal_history():
    """Individual meal rows within the last N days, newest first. Parallels
    /api/workout-history — /api/history groups per day and drops ids, which
    makes tap-to-edit impossible on the mobile History list."""
    days = int(request.args.get("days", 90))
    cutoff = (date.today() - timedelta(days=days)).isoformat()
    from db import get_conn
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT id, user_id, log_date, logged_at, description,
                   calories, protein_g, carbs_g, fat_g, sugar_g, fiber_g, sodium_mg
            FROM meal_logs
            WHERE user_id = ? AND log_date >= ?
            ORDER BY log_date DESC, logged_at DESC, id DESC
            """,
            (uid(), cutoff),
        ).fetchall()
    return jsonify([dict(r) for r in rows])


@app.route("/api/weight-history")
@login_required
def api_weight_history():
    """Daily weight entries within the last N days, oldest first. Used for the
    mobile Body-weight trend chart. Returns [{date, weight_lbs}].

    Fallback: if no daily_activity rows exist in the window but the user has a
    starting weight in their onboarding record, synthesize a single baseline
    point dated to onboarding completion (clamped into the window). This
    ensures the chart renders for users who onboarded but never hit Save Weight
    on the Flask PWA / mobile Body Stats editor."""
    days = int(request.args.get("days", 90))
    cutoff = (date.today() - timedelta(days=days)).isoformat()
    from db import get_conn
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT log_date AS date, weight_lbs
            FROM daily_activity
            WHERE user_id = ? AND log_date >= ? AND weight_lbs IS NOT NULL
            ORDER BY log_date
            """,
            (uid(), cutoff),
        ).fetchall()
    results = [{"date": r["date"], "weight_lbs": r["weight_lbs"]} for r in rows]

    if not results:
        with get_conn() as conn:
            ob = conn.execute(
                "SELECT raw_inputs, profile_map, created_at FROM user_onboarding WHERE user_id = ?",
                (uid(),)
            ).fetchone()
        if ob:
            try:
                pm = json.loads(ob["profile_map"] or "{}")
                raw = json.loads(ob["raw_inputs"] or "{}")
                baseline = pm.get("current_weight_lbs") or raw.get("current_weight_lbs")
            except (ValueError, TypeError):
                baseline = None
            if baseline:
                ob_date = (ob["created_at"] or "")[:10]
                try:
                    date.fromisoformat(ob_date)
                except ValueError:
                    ob_date = cutoff
                seed_date = ob_date if ob_date >= cutoff else cutoff
                results.append({"date": seed_date, "weight_lbs": float(baseline)})

    return jsonify(results)


@app.route("/api/charts/burn")
@login_required
def api_chart_burn():
    """Per-day total calories burned within the last N days, oldest first.
    Days with no workouts are omitted. Returns [{date, total_burn}]."""
    days = int(request.args.get("days", 90))
    cutoff = (date.today() - timedelta(days=days)).isoformat()
    from db import get_conn
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT log_date AS date, COALESCE(SUM(calories_burned), 0) AS total_burn
            FROM workout_logs
            WHERE user_id = ? AND log_date >= ?
            GROUP BY log_date
            ORDER BY log_date
            """,
            (uid(), cutoff),
        ).fetchall()
    return jsonify([{"date": r["date"], "total_burn": int(r["total_burn"])} for r in rows])


@app.route("/api/charts/calories")
@login_required
def api_chart_calories():
    """Per-day total calories consumed within the last N days, oldest first.
    Days with no meals are omitted. Returns [{date, calories}]."""
    days = int(request.args.get("days", 90))
    cutoff = (date.today() - timedelta(days=days)).isoformat()
    from db import get_conn
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT log_date AS date, COALESCE(SUM(calories), 0) AS calories
            FROM meal_logs
            WHERE user_id = ? AND log_date >= ?
            GROUP BY log_date
            ORDER BY log_date
            """,
            (uid(), cutoff),
        ).fetchall()
    return jsonify([{"date": r["date"], "calories": int(r["calories"])} for r in rows])


@app.route("/api/charts/macros")
@login_required
def api_chart_macros():
    """Per-day macro totals within the last N days, oldest first. Used by
    the Nutrition Progress macro-trend charts. Returns
    [{date, protein_g, carbs_g, fat_g}]."""
    days = int(request.args.get("days", 90))
    cutoff = (date.today() - timedelta(days=days)).isoformat()
    from db import get_conn
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT log_date AS date,
                   COALESCE(SUM(protein_g), 0) AS protein_g,
                   COALESCE(SUM(carbs_g),   0) AS carbs_g,
                   COALESCE(SUM(fat_g),     0) AS fat_g
            FROM meal_logs
            WHERE user_id = ? AND log_date >= ?
            GROUP BY log_date
            ORDER BY log_date
            """,
            (uid(), cutoff),
        ).fetchall()
    return jsonify([
        {
            "date": r["date"],
            "protein_g": float(r["protein_g"]),
            "carbs_g":   float(r["carbs_g"]),
            "fat_g":     float(r["fat_g"]),
        }
        for r in rows
    ])


@app.route("/api/activity-calendar")
@login_required
def api_activity_calendar():
    """Workout type per day within the last N days. Strength / cardio / mixed
    classification is deferred to the client (shares the mobile classifier) —
    this endpoint just returns the joined descriptions for each day so the
    mobile UI can decide the dot color. Returns [{date, descriptions}]."""
    days = int(request.args.get("days", 90))
    cutoff = (date.today() - timedelta(days=days)).isoformat()
    from db import get_conn
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT log_date AS date, GROUP_CONCAT(description, '|') AS descriptions
            FROM workout_logs
            WHERE user_id = ? AND log_date >= ?
            GROUP BY log_date
            ORDER BY log_date
            """,
            (uid(), cutoff),
        ).fetchall()
    return jsonify([
        {"date": r["date"], "descriptions": (r["descriptions"] or "").split("|") if r["descriptions"] else []}
        for r in rows
    ])


@app.route("/api/momentum/insight", methods=["POST"])
@login_required
def api_momentum_insight():
    today = client_today()
    body  = request.get_json(silent=True) or {}
    hour = body.get("hour")
    try:
        hour = int(hour) if hour is not None else None
    except (TypeError, ValueError):
        hour = None
    try:
        # Use exact values from frontend Live Preview — single source of truth
        tdee = int(body.get("tdee") or 0) or None
        cal_target = int(body.get("target_intake") or 0) or None
        totals       = get_today_totals(uid(), today)
        cal_consumed = totals["total_calories"]
        profile      = get_profile_map(uid())

        _log.info("INSIGHT: tdee=%s cal_consumed=%s cal_target=%s", tdee, cal_consumed, cal_target)

        result       = generate_momentum_insight(
            {}, [], profile,
            hour=hour, tdee=tdee, cal_consumed=cal_consumed, cal_target=cal_target,
        )
        return jsonify(result)
    except Exception as e:
        _log.exception("momentum-insight failed")
        return jsonify({"error": _AI_ERR}), 500


# ── Unified Goals (PRD §4.10) ────────────────────────────────────────────
# Slot ceiling. Per founder direction for this cycle: treat all users as Pro
# → 6 active goals. When paywall lands, read this from users.tier instead.
_GOAL_SLOT_LIMIT_PRO = 6


def _user_goal_slot_limit(user_id: int) -> int:
    return _GOAL_SLOT_LIMIT_PRO


def _serialize_goal(goal: dict) -> dict:
    """Trim internal-only fields and pass pace/progress through cleanly."""
    if not goal:
        return goal
    # Nothing needs removing for v1 — keep the dict as-is. Placeholder in case
    # we later strip config_json etc.
    return goal


@app.route("/api/goal-library", methods=["GET"])
@login_required
def api_goal_library():
    """Return the v1 22-goal library for the picker UI. Client caches on
    cold-start (PRD §4.10.3). Static within a session."""
    return jsonify({"ok": True, "library": list_goal_library()})


@app.route("/api/goals", methods=["GET"])
@login_required
def api_goals_list():
    """List the user's goals, optionally filtered by status.
    Default: active + paused (the 'current' bucket)."""
    status_filter = request.args.get("status")
    if status_filter == "all":
        statuses = None
    elif status_filter == "active":
        statuses = ["active"]
    elif status_filter == "archived":
        statuses = ["archived"]
    elif status_filter == "completed":
        statuses = ["completed"]
    else:
        statuses = ["active", "paused"]

    # Hot-path recompute: for active goals, refresh progress+pace on read.
    # Post-v1 this moves to a nightly snapshot; for v1 the extra work is
    # cheap (at most 6 rows per user).
    if statuses and "active" in statuses:
        recomputed = {g["goal_id"]: g for g in goals_engine.recompute_all_active_goals(uid())}
        goals_out = []
        for g in list_user_goals(uid(), statuses=statuses):
            goals_out.append(_serialize_goal(recomputed.get(g["goal_id"], g)))
    else:
        goals_out = [_serialize_goal(g) for g in list_user_goals(uid(), statuses=statuses)]

    return jsonify({
        "ok": True,
        "goals": goals_out,
        "slot_limit": _user_goal_slot_limit(uid()),
        "active_count": count_active_goals(uid()),
    })


@app.route("/api/goals/<int:goal_id>", methods=["GET"])
@login_required
def api_goals_detail(goal_id: int):
    goal = get_goal(goal_id, uid())
    if not goal:
        return jsonify({"ok": False, "error": "Goal not found", "error_code": "not_found"}), 404
    if goal["status"] == "active":
        goal = goals_engine.recompute_and_persist_goal(goal_id, uid(), goal)
    history = get_goal_progress_history(goal_id, days=90)
    return jsonify({"ok": True, "goal": _serialize_goal(goal), "history": history})


@app.route("/api/goals", methods=["POST"])
@login_required
def api_goals_create():
    """Create a new goal from a library entry.

    Body: { library_id, target_value?, target_streak_length?, target_count?,
            target_rate?, start_value?, baseline_value?, deadline?,
            display_name?, direction?, is_primary? }

    Slot-limit enforced here: 402-style response with error_code
    'slot_limit_reached' if user already has max active goals. (Per founder
    direction for this cycle, all users are Pro limit = 6.)"""
    data = request.get_json(silent=True) or {}
    library_id = (data.get("library_id") or "").strip()
    if not library_id:
        return jsonify({"ok": False, "error": "library_id required",
                        "error_code": "validation_failed"}), 400
    lib = get_library_entry(library_id)
    if not lib:
        return jsonify({"ok": False, "error": "Unknown library_id",
                        "error_code": "not_found"}), 404
    if count_active_goals(uid()) >= _user_goal_slot_limit(uid()):
        return jsonify({
            "ok": False,
            "error": "You've hit your active goal limit. Archive one to add another.",
            "error_code": "slot_limit_reached",
            "slot_limit": _user_goal_slot_limit(uid()),
        }), 409

    # Per PRD §4.10.2: only fitness body-composition goals can be primary
    # AND drive calorie math. For v1, that's FIT-01 only. Validate.
    is_primary = bool(data.get("is_primary", False))
    if is_primary and not (lib["category"] == "fitness" and lib.get("affects_calorie_math")):
        return jsonify({
            "ok": False,
            "error": "Only a body-composition fitness goal can be primary",
            "error_code": "validation_failed",
        }), 400

    try:
        goal_id = create_goal_from_library(
            user_id=uid(),
            library_id=library_id,
            target_value=data.get("target_value"),
            target_streak_length=data.get("target_streak_length"),
            target_count=data.get("target_count"),
            target_rate=data.get("target_rate"),
            start_value=data.get("start_value"),
            baseline_value=data.get("baseline_value"),
            deadline=data.get("deadline"),
            display_name=data.get("display_name"),
            direction=data.get("direction"),
            is_primary=is_primary,
            period=data.get("period"),
            window_size=data.get("window_size"),
            aggregation=data.get("aggregation"),
            period_unit=data.get("period_unit"),
        )
    except ValueError as e:
        return jsonify({"ok": False, "error": str(e), "error_code": "validation_failed"}), 400
    except Exception:
        _log.exception("goals/create failed")
        return jsonify({"ok": False, "error": "Could not create goal", "error_code": "db_error"}), 500

    # If this is the new primary fitness goal, sync the calorie driver row.
    if is_primary and lib.get("affects_calorie_math"):
        _sync_calorie_driver_from_primary_fitness(uid())

    goal = goals_engine.recompute_and_persist_goal(goal_id, uid())
    return jsonify({"ok": True, "goal": _serialize_goal(goal)}), 201


@app.route("/api/goals/<int:goal_id>", methods=["PATCH"])
@login_required
def api_goals_update(goal_id: int):
    """Edit a goal (PRD §4.10.12). Editable: target_value, target_streak_length,
    target_count, target_rate, deadline, display_name, is_primary,
    auto_restart_enabled. Library_id / goal_type / category / start_value
    are immutable."""
    data = request.get_json(silent=True) or {}
    existing = get_goal(goal_id, uid())
    if not existing:
        return jsonify({"ok": False, "error": "Goal not found", "error_code": "not_found"}), 404

    # Validate is_primary flip
    if data.get("is_primary"):
        if not (existing["category"] == "fitness" and existing.get("affects_calorie_math")):
            return jsonify({
                "ok": False,
                "error": "Only a body-composition fitness goal can be primary",
                "error_code": "validation_failed",
            }), 400

    ok = update_goal_fields(goal_id, uid(), data)
    if not ok:
        return jsonify({"ok": False, "error": "Nothing updated",
                        "error_code": "validation_failed"}), 400

    if "is_primary" in data and existing.get("affects_calorie_math"):
        _sync_calorie_driver_from_primary_fitness(uid())

    goal = goals_engine.recompute_and_persist_goal(goal_id, uid())
    return jsonify({"ok": True, "goal": _serialize_goal(goal)})


@app.route("/api/goals/<int:goal_id>/archive", methods=["POST"])
@login_required
def api_goals_archive(goal_id: int):
    existing = get_goal(goal_id, uid())
    if not existing:
        return jsonify({"ok": False, "error": "Goal not found", "error_code": "not_found"}), 404
    was_primary_fit = bool(existing.get("is_primary") and existing.get("affects_calorie_math"))
    ok = archive_goal(goal_id, uid())
    if not ok:
        return jsonify({"ok": False, "error": "Could not archive",
                        "error_code": "validation_failed"}), 400
    if was_primary_fit:
        _sync_calorie_driver_from_primary_fitness(uid())
    return jsonify({"ok": True})


@app.route("/api/goals/<int:goal_id>/unarchive", methods=["POST"])
@login_required
def api_goals_unarchive(goal_id: int):
    if count_active_goals(uid()) >= _user_goal_slot_limit(uid()):
        return jsonify({
            "ok": False,
            "error": "Slot limit reached — archive another goal first.",
            "error_code": "slot_limit_reached",
        }), 409
    ok = unarchive_goal(goal_id, uid())
    if not ok:
        return jsonify({"ok": False, "error": "Goal not archived or not found",
                        "error_code": "not_found"}), 404
    return jsonify({"ok": True})


@app.route("/api/goals/<int:goal_id>/complete", methods=["POST"])
@login_required
def api_goals_complete(goal_id: int):
    """Manually mark a goal complete. Auto-completion happens inside
    goals_engine when progress hits 100%; this route is for user-initiated
    completion (e.g. best-attempt goals where the user self-reports)."""
    existing = get_goal(goal_id, uid())
    if not existing:
        return jsonify({"ok": False, "error": "Goal not found", "error_code": "not_found"}), 404
    was_primary_fit = bool(existing.get("is_primary") and existing.get("affects_calorie_math"))
    ok = mark_goal_completed(goal_id, uid())
    if not ok:
        return jsonify({"ok": False, "error": "Could not complete (not active?)",
                        "error_code": "validation_failed"}), 400
    if was_primary_fit:
        _sync_calorie_driver_from_primary_fitness(uid())
    return jsonify({"ok": True})


def _sync_calorie_driver_from_primary_fitness(user_id: int) -> None:
    """Rewrite user_goals (the single-row calorie-driver table) from the
    user's current primary fitness goal.

    If the primary fitness goal is archived / completed / removed, the
    driver row is left as-is (don't nuke calorie targets mid-day). Future:
    fall back to maintenance calories (PRD §4.10.12 archival rule) — this
    requires a body-stats snapshot we don't yet capture cleanly. Logging
    this TODO so the gap is visible."""
    primary = get_primary_fitness_goal(user_id)
    if not primary:
        _log.info(
            "goals: primary fitness goal cleared for user=%s; calorie driver "
            "row left intact (no auto-maintenance fallback in v1).",
            user_id,
        )
        return
    # For FIT-01 specifically we only have target_value (goal weight). Full
    # calorie recompute needs body stats (height/age/sex/bf%) which live
    # in user_onboarding.profile_map. Rather than re-derive from scratch
    # here (the onboarding save path already does this), we mirror the
    # primary goal's target_weight_lbs into user_goals.config_json for
    # provenance. The next /api/goal/update call from the client will
    # rewrite calorie_target + macros deterministically using the new
    # target_weight. This keeps the calorie-math code path identical
    # regardless of entry point (settings slider vs goal create/edit).
    existing = get_user_goal(user_id)
    if not existing:
        return
    import json as _json
    cfg = {}
    try:
        cfg = _json.loads(existing.get("config_json") or "{}")
    except Exception:
        cfg = {}
    cfg["primary_fitness_goal_id"] = primary["goal_id"]
    cfg["primary_fitness_goal_target_value"] = primary.get("target_value")
    upsert_user_goal(
        user_id=user_id,
        goal_key=existing["goal_key"],
        calorie_target=existing["calorie_target"],
        protein_g=existing["protein_g"],
        fat_g=existing["fat_g"],
        carbs_g=existing["carbs_g"],
        deficit_surplus=existing["deficit_surplus"],
        rmr=existing["rmr"],
        rmr_method=existing["rmr_method"],
        tdee_used=existing["tdee_used"],
        config_json=_json.dumps(cfg),
        sources_json=existing["sources_json"],
    )


@app.route("/api/goal/update", methods=["POST"])
@login_required
def api_goal_update():
    """Persist goal targets — uses the user's exact slider values.

    The client sends `rmr` (resting floor) and `tdee` (full daily expenditure)
    as separate fields. Calorie target = max(tdee + deficit, rmr) — deficit
    bites against TDEE but the target never drops below RMR. Legacy callers
    that only send `rmr` still work (tdee falls back to rmr = old behavior).
    """
    data = request.get_json() or {}
    goal_key = data.get("goal", "lose_weight")
    try:
        rmr = int(data.get("rmr") or 0)
        tdee_val = int(data.get("tdee") or rmr)
        deficit = int(data.get("deficit", 0))
        protein = int(data.get("protein", 150))
        carbs = int(data.get("carbs", 200))
        fat = int(data.get("fat", 65))
        # Calorie target = TDEE + deficit, floored at RMR so deficits never
        # drop below resting burn.
        if tdee_val > 0 or rmr > 0:
            cal_target = max(tdee_val + deficit, rmr)
        else:
            cal_target = 2000

        upsert_user_goal(
            user_id=uid(),
            goal_key=goal_key,
            calorie_target=cal_target,
            protein_g=protein,
            fat_g=fat,
            carbs_g=carbs,
            deficit_surplus=deficit,
            rmr=rmr,
            rmr_method="client",
            tdee_used=tdee_val,
            config_json="{}",
            sources_json="[]",
        )
        return jsonify({"ok": True, "targets": {
            "goal_key": goal_key,
            "calorie_target": cal_target,
            "protein_g": protein,
            "fat_g": fat,
            "carbs_g": carbs,
            "deficit_surplus": deficit,
            "rmr": rmr,
        }})
    except Exception as e:
        _log.exception("goal/update failed")
        return jsonify({"error": "Could not update goals. Please try again."}), 500


@app.route("/api/momentum/summary", methods=["POST"])
@login_required
def api_momentum_summary():
    """Generate or return cached AI summary at day/week/month scale."""
    data  = request.get_json(silent=True) or {}
    scale = data.get("scale", "day")
    if scale not in ("day", "week", "month"):
        return jsonify({"error": "Invalid scale. Use day, week, or month."}), 400

    today = client_today()
    force = data.get("force", False)

    # Check cache (unless forced refresh)
    if not force:
        cached = get_momentum_summary(uid(), today, scale)
        if cached:
            return jsonify({"summary": cached["summary_text"], "cached": True})

    # Ensure today's score is fresh before generating summary
    hour = data.get("hour")
    try:
        hour = int(hour) if hour is not None else None
    except (TypeError, ValueError):
        hour = None
    compute_momentum(uid(), today, hour=hour)

    # Determine history window
    days_map = {"day": 1, "week": 7, "month": 30}
    history = get_momentum_history_with_deltas(uid(), days_map[scale])

    # Get goal label
    goal = get_user_goal(uid())
    goal_label = "your goal"
    if goal:
        from goal_config import get_goal_config
        goal_label = get_goal_config(goal["goal_key"])["label"]

    try:
        summary_text = generate_scale_summary(scale, goal_label, history)
        save_momentum_summary(uid(), today, scale, summary_text)
        return jsonify({"summary": summary_text, "cached": False})
    except Exception as e:
        _log.exception("momentum/summary failed")
        return jsonify({"error": _AI_ERR}), 500


# ── Nightly score snapshot cron ────────────────────────
# Minimal in-process cron: sleep until 03:30 UTC, snapshot yesterday's
# scores for every onboarding-complete user, then sleep 24h. No leader
# election — with multiple gunicorn workers the job runs redundantly,
# but scoring.snapshot_scores is idempotent (upsert) so extra runs are
# wasteful but harmless. Good enough for v1 single-replica Railway.
# Replace with SQS + Lambda (PRD §11.5) when we migrate off Railway.

def _score_snapshot_worker():
    import time as _t
    import scoring as _scoring
    from datetime import datetime as _dt, date as _d, timedelta as _td

    # On startup, do one pass for each completed user so fresh Railway
    # deploys don't wait until 03:30 UTC for the first snapshot.
    try:
        _snapshot_all_users(_d.today().isoformat(), _scoring)
    except Exception as _e:
        _log.warning("initial score snapshot pass failed: %s", _e)

    while True:
        now = _dt.utcnow()
        next_run = now.replace(hour=3, minute=30, second=0, microsecond=0)
        if next_run <= now:
            next_run += _td(days=1)
        sleep_s = max(60.0, (next_run - now).total_seconds())
        _t.sleep(sleep_s)
        try:
            yesterday = (_d.today() - _td(days=1)).isoformat()
            _snapshot_all_users(yesterday, _scoring)
            _log.info("nightly snapshot complete for %s", yesterday)
        except Exception as e:
            _log.warning("nightly snapshot failed: %s", e)

        # Nightly chatbot audit retention purge — 30 days both tiers per v1.21.
        try:
            import chatbot as _cb
            removed = _cb.purge_audit_older_than(days=30)
            if removed:
                _log.info("chatbot_audit purge removed %d rows", removed)
        except Exception as e:
            _log.warning("chatbot_audit purge failed: %s", e)


def _snapshot_all_users(target_date: str, scoring_module):
    from db import get_conn as _conn
    with _conn() as conn:
        user_ids = [
            r["user_id"]
            for r in conn.execute(
                "SELECT user_id FROM user_onboarding WHERE completed = 1"
            ).fetchall()
        ]
    for uid_ in user_ids:
        try:
            scoring_module.snapshot_scores(uid_, target_date)
        except Exception as e:
            _log.warning("snapshot user %s date %s failed: %s", uid_, target_date, e)


def _start_score_cron():
    """Start the snapshot worker thread (idempotent)."""
    if getattr(_start_score_cron, "_started", False):
        return
    t = threading.Thread(target=_score_snapshot_worker, name="score-snapshot-cron", daemon=True)
    t.start()
    _start_score_cron._started = True


_start_score_cron()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
