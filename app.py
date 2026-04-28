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
    list_user_tasks, update_mind_task,
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



@app.route("/api/mind/tasks", methods=["GET"])
@login_required
def api_mind_list_tasks():
    """Mobile-facing task list. Returns future + overdue + today's items +
    recently-completed. Scope:
      ?include_completed=0  — only incomplete
      ?days_ahead=N         — how far into the future to include (default 60)
    """
    include_completed = request.args.get("include_completed", "1") != "0"
    try:
        days_ahead = int(request.args.get("days_ahead", 60))
    except (TypeError, ValueError):
        days_ahead = 60
    tasks = list_user_tasks(uid(), include_completed=include_completed,
                            days_ahead=max(0, min(days_ahead, 365)))
    return jsonify({"ok": True, "tasks": tasks})


@app.route("/api/mind/task", methods=["POST"])
@login_required
def api_mind_add_task():
    data = request.get_json() or {}
    desc = (data.get("description") or "").strip()
    if not desc:
        return jsonify({"ok": False, "error": "description required",
                        "error_code": "validation_failed"}), 400
    tid = insert_mind_task(
        uid(), desc,
        task_date=client_today(),
        due_date=(data.get("due_date") or None),
        priority=bool(data.get("priority", False)),
    )
    return jsonify({
        "ok": True,
        "task": {
            "id": tid,
            "description": desc,
            "completed": 0,
            "source": "manual",
            "due_date": data.get("due_date"),
            "priority": 1 if data.get("priority") else 0,
        },
    })


@app.route("/api/mind/task/<int:task_id>", methods=["PATCH"])
@login_required
def api_mind_patch_task(task_id):
    """Dual behavior: body={} → toggle; body={...fields} → edit.
    Keeps old single-argument toggle contract working for existing callers."""
    data = request.get_json(silent=True) or {}
    if not data or ("toggle" in data and data.get("toggle")):
        ok = toggle_mind_task(task_id, uid())
        if not ok:
            return jsonify({"ok": False, "error": "Task not found",
                            "error_code": "not_found"}), 404
        return jsonify({"ok": True})
    ok = update_mind_task(task_id, uid(), data)
    if not ok:
        return jsonify({"ok": False, "error": "Nothing updated",
                        "error_code": "validation_failed"}), 400
    return jsonify({"ok": True})


@app.route("/api/mind/task/<int:task_id>", methods=["DELETE"])
@login_required
def api_mind_delete_task(task_id):
    delete_mind_task(task_id, uid())
    return jsonify({"ok": True})


# Today's Focus — deterministic ranking per PRD §4.6.4.
# No AI; stable ordering. For v1 we rank from three sources we own today:
#   1. Overdue priority tasks (priority=1, due_date < today, incomplete)
#   2. Today-priority tasks (priority=1, due_date <= today, incomplete)
#   3. Overdue tasks (any, incomplete, due_date < today)
#   4. Today tasks (any, due_date == today OR task_date == today, incomplete)
# Caps at 5 items. When Gmail / Calendar land, they plug in as higher-rank
# candidates (unreplied-important, meeting-prep-needed).
@app.route("/api/time/focus", methods=["GET"])
@login_required
def api_time_focus():
    """Today's Focus — deterministic ranked list pulled from three sources:
      * tasks: overdue / due-today (existing logic)
      * Gmail: unreplied + important-flagged emails
      * Calendar: events starting in the next 4 hours

    Items are discriminated by `kind` ('task' | 'email' | 'event') so the
    mobile UI can render kind-specific affordances (checkbox for tasks,
    different icon for emails/events). Capped at 5 items returned.
    """
    from datetime import date as _d, datetime as _dt, timedelta as _td, timezone as _tz
    today = _d.today().isoformat()
    ranked: list[dict] = []

    def tag(item: dict, kind: str, priority_level: str, reason: str, description: str):
        return {
            **item,
            "kind":             kind,
            "_focus_priority":  priority_level,
            "_focus_reason":    reason,
            "description":      description,
        }

    # ── Tasks ─────────────────────────────────────────────────────────────
    tasks = list_user_tasks(uid(), include_completed=False, days_ahead=0)
    for t in tasks:
        if t.get("completed"):
            continue
        due = t.get("due_date")
        is_priority = bool(t.get("priority"))
        desc = t.get("description", "")
        if due and due < today and is_priority:
            ranked.append(tag(t, "task", "critical", "overdue priority task", desc))
        elif due == today and is_priority:
            ranked.append(tag(t, "task", "high", "due today (priority)", desc))
        elif due and due < today:
            ranked.append(tag(t, "task", "medium", "overdue", desc))
        elif due == today or t.get("task_date") == today:
            ranked.append(tag(t, "task", "normal", "due today", desc))

    # ── Gmail: unreplied + important ──────────────────────────────────────
    try:
        from db import get_gmail_tokens, get_gmail_cache, get_importance_rules, score_email_importance
        if get_gmail_tokens(uid()):
            cached = get_gmail_cache(uid(), limit=100) or []
            rules = get_importance_rules(uid()) or {}
            for e in cached:
                if e.get("is_read") or e.get("has_replied"):
                    continue
                score = score_email_importance(e.get("sender", ""), rules) if rules else 0
                if score <= 0:
                    continue  # Only surface emails the user has labeled important
                desc = f"📧 Reply to {e.get('sender', 'unknown')}: {e.get('subject', '(no subject)')}"
                ranked.append(tag({
                    "sender":     e.get("sender", ""),
                    "subject":    e.get("subject", ""),
                    "message_id": e.get("message_id", ""),
                }, "email", "high", "unreplied · important", desc))
    except Exception:
        _log.exception("time/focus: Gmail surface failed (non-fatal)")

    # ── Calendar (Google + Outlook): events in next 4 hours ──────────────
    def _add_event_focus(events: list[dict], source_label: str) -> None:
        now_utc = _dt.now(_tz.utc)
        for ev in events:
            if ev.get("all_day"):
                continue
            attendees = int(ev.get("attendees_count") or 0)
            title = ev.get("title", "(untitled event)")
            try:
                start_dt = _dt.fromisoformat(ev["start_iso"].replace("Z", "+00:00"))
                delta_min = max(0, int((start_dt - now_utc).total_seconds() // 60))
                when = f"in {delta_min} min" if delta_min < 60 else f"in {delta_min // 60}h {delta_min % 60}m"
            except (ValueError, KeyError):
                when = "soon"
            priority = "high" if attendees > 1 else "normal"
            base = "meeting" if attendees > 1 else "event"
            reason = f"{base} {when} · {source_label}"
            desc = f"📅 {title}"
            ranked.append(tag({
                "start_iso": ev.get("start_iso", ""),
                "end_iso":   ev.get("end_iso", ""),
                "location":  ev.get("location", ""),
                "all_day":   bool(ev.get("all_day")),
            }, "event", priority, reason, desc))

    try:
        import connectors as _conn
        from db import get_gcal_events, get_outlook_events
        now_utc = _dt.now(_tz.utc)
        window_end = now_utc + _td(hours=4)
        now_iso = now_utc.isoformat()
        end_iso = window_end.isoformat()
        gcal_row = _conn.get_connector(uid(), 'gcal')
        if gcal_row and gcal_row.get('status') == _conn.STATUS_CONNECTED:
            _add_event_focus(
                get_gcal_events(uid(), start_iso=now_iso, end_iso=end_iso, limit=10) or [],
                "Google",
            )
        outlook_row = _conn.get_connector(uid(), 'outlook')
        if outlook_row and outlook_row.get('status') == _conn.STATUS_CONNECTED:
            _add_event_focus(
                get_outlook_events(uid(), start_iso=now_iso, end_iso=end_iso, limit=10) or [],
                "Outlook",
            )
    except Exception:
        _log.exception("time/focus: Calendar surface failed (non-fatal)")

    # ── Outlook: top unread emails ────────────────────────────────────────
    # Outlook doesn't have the importance-rules system Gmail has yet, so
    # we surface the most-recent unread (cap 2) so it doesn't drown the
    # focus list.
    try:
        import connectors as _conn
        from db import get_outlook_emails
        outlook_row = _conn.get_connector(uid(), 'outlook')
        if outlook_row and outlook_row.get('status') == _conn.STATUS_CONNECTED:
            emails = get_outlook_emails(uid(), limit=20) or []
            unread = [e for e in emails if not e.get("is_read")][:2]
            for e in unread:
                desc = f"📬 {e.get('sender', 'unknown')}: {e.get('subject', '(no subject)')}"
                ranked.append(tag({
                    "sender":     e.get("sender", ""),
                    "subject":    e.get("subject", ""),
                    "message_id": e.get("message_id", ""),
                }, "email", "normal", "unread · Outlook", desc))
    except Exception:
        _log.exception("time/focus: Outlook surface failed (non-fatal)")

    # ── Rank + cap ────────────────────────────────────────────────────────
    ranked.sort(key=lambda r: {"critical": 0, "high": 1, "medium": 2, "normal": 3}[r["_focus_priority"]])
    return jsonify({"ok": True, "focus": ranked[:5], "total_candidates": len(ranked)})


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
    """Revise the user's active plan. Body:
      { change_request: str,
        dry_run?: bool,           # default false; when true, return the
                                  # AI-proposed plan WITHOUT saving so the
                                  # client can show it for review + Save
        current_plan?: dict }     # optional override of the AI's "current"
                                  # context; lets the mobile draft-mode
                                  # send the user's already-edited working
                                  # copy as the basis for the AI's revise

    Uses the stored quiz_payload as AI context. Plan source is either the
    request's `current_plan` (preferred when sent — supports edits-on-top-
    of-edits) or the DB's active plan."""
    from db import get_active_workout_plan, save_active_workout_plan
    data = request.get_json() or {}
    change_request = (data.get("change_request") or "").strip()
    dry_run = bool(data.get("dry_run", False))
    current_plan_override = data.get("current_plan") if isinstance(data.get("current_plan"), dict) else None
    if not change_request:
        return jsonify({"error": "Missing change_request"}), 400
    current = get_active_workout_plan(uid())
    if not current:
        return jsonify({"error": "No active plan to revise"}), 404
    base_plan = current_plan_override if current_plan_override is not None else (current.get("plan") or {})
    try:
        revised = revise_plan(
            current.get("quiz_payload") or {},
            base_plan,
            change_request,
        )
    except Exception:
        _log.exception("workout-plan/revise AI call failed")
        return jsonify({"error": _AI_ERR}), 500
    if dry_run:
        # Return the proposed plan so the client can preview + let the
        # user accept (PATCH) or discard. No DB write.
        return jsonify({"plan": revised, "dry_run": True})
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
    # Also flip the unified connector row to revoked so the new
    # Settings → Connections UI reflects the disconnect immediately
    # (not just after the next /init call).
    try:
        import connectors as _conn
        _conn.save_connector(
            uid(), 'gmail',
            access_token=None, refresh_token=None, expires_at=None, scopes=None,
            status=_conn.STATUS_REVOKED,
            last_error=None, last_error_detail=None,
        )
    except Exception:
        _log.exception("gmail/disconnect: connector mark-revoked failed (non-fatal)")
    return jsonify({"ok": True})


# ── Mobile Gmail OAuth flow (PKCE-style state via oauth_states table) ────
# Bearer-authed counterparts to /api/gmail/connect and /callback so the
# mobile app can drive the OAuth flow via expo-web-browser without
# relying on Flask session cookies (which don't survive a redirect to a
# third-party domain and back into a deep link).

@app.route("/api/gmail/oauth/init", methods=["POST"])
@login_required
def api_gmail_oauth_init():
    """Issue a state token + the auth URL the mobile client opens.

    Body: { redirect_uri }  — e.g. "lifedashboard://oauth/gmail"
    Returns: { auth_url, state }
    The redirect_uri must be one the user has registered in Google Cloud
    Console (the mobile flow uses a custom-scheme URI like
    lifedashboard://oauth/gmail). Flask doesn't itself validate it
    against an allowlist — Google does on the redirect.
    """
    import oauth_state_store as _oss
    from api_errors import err, SERVER_CONFIG, VALIDATION_FAILED
    if not gmail_sync.is_configured():
        return err(SERVER_CONFIG, "Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.", 400)
    data = request.get_json(silent=True) or {}
    redirect_uri = (data.get("redirect_uri") or "").strip()
    if not redirect_uri:
        return err(VALIDATION_FAILED, "redirect_uri required", 400)
    state = _oss.create_state(uid(), 'gmail', redirect_after=redirect_uri)
    auth_url = gmail_sync.get_auth_url(redirect_uri, state=state)
    return jsonify({"ok": True, "auth_url": auth_url, "state": state})


@app.route("/api/gmail/oauth/exchange", methods=["POST"])
@login_required
def api_gmail_oauth_exchange():
    """Exchange the auth code for tokens. Two flows supported:

    Web/desktop (legacy session path): Body: { code, state, redirect_uri }.
      Uses GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET. State stored in
      Flask session (the older /api/gmail/connect path) — this route
      doesn't read session state; web callers should use
      /api/gmail/callback instead.

    Native (iOS/Android via expo-auth-session/providers/google):
      Body: { code, redirect_uri, platform: 'ios'|'android',
              code_verifier, state? }.
      Uses GOOGLE_CLIENT_ID_{IOS,ANDROID} (no secret) + the PKCE
      verifier per RFC 8252. State is verified against B1 oauth_states
      ONLY IF the mobile flow used /api/gmail/oauth/init to issue one.
      For expo-auth-session's own state (it manages its own), pass it
      through as state and we'll skip the consume_state lookup.

    Returns: { ok, email } on success, or structured error_code.
    """
    import oauth_state_store as _oss
    import connectors as _conn
    from api_errors import err, OAUTH_STATE_INVALID, OAUTH_EXCHANGE_FAILED, VALIDATION_FAILED
    data = request.get_json(silent=True) or {}
    code = (data.get("code") or "").strip()
    state = (data.get("state") or "").strip()
    redirect_uri = (data.get("redirect_uri") or "").strip()
    platform = (data.get("platform") or "").strip().lower() or None
    code_verifier = (data.get("code_verifier") or "").strip() or None
    if not (code and redirect_uri):
        return err(VALIDATION_FAILED, "code and redirect_uri are required", 400)
    # If the mobile flow opened the auth URL via /api/gmail/oauth/init, it
    # has a server-issued state token in B1's oauth_states table — verify
    # and consume. expo-auth-session/providers/google manages its own
    # state client-side and doesn't talk to /init; in that path state
    # comes back as whatever the client generated, and we don't have a
    # row to verify against. We accept either — the security model for
    # native is PKCE (the code_verifier), not state.
    if state:
        ctx = _oss.consume_state(state, expected_provider='gmail')
        if ctx and ctx['user_id'] != uid():
            return err(OAUTH_STATE_INVALID, "OAuth state invalid", 400)
        # No ctx is fine — state was generated client-side.
    if platform in ('ios', 'android') and not code_verifier:
        return err(VALIDATION_FAILED,
                   "code_verifier required for native OAuth (PKCE)", 400)
    try:
        token_data = gmail_sync.exchange_code(
            code, redirect_uri,
            platform=platform, code_verifier=code_verifier,
        )
        access_token = token_data["access_token"]
        refresh_token = token_data.get("refresh_token", "")
        expires_in = token_data.get("expires_in", 3600)
        token_expiry = gmail_sync.compute_expiry(expires_in)
        email_address = gmail_sync.get_user_email(access_token)
        # Persist to BOTH the legacy gmail_tokens table (gmail_sync.py
        # still reads it) AND the unified users_connectors row (so the
        # Connections UI reflects status immediately).
        save_gmail_tokens(uid(), access_token, refresh_token, token_expiry, email_address)
        try:
            import time as _t
            _conn.save_connector(
                uid(), 'gmail',
                access_token=access_token,
                refresh_token=refresh_token,
                expires_at=int(_t.time()) + int(expires_in),
                scopes='https://www.googleapis.com/auth/gmail.readonly',
                external_user_id=email_address,
                status=_conn.STATUS_CONNECTED,
                last_sync_at=int(_t.time()),
                last_error=None, last_error_detail=None,
            )
        except Exception:
            _log.exception("gmail/oauth/exchange: users_connectors write failed (non-fatal)")
        _log.info("Gmail (mobile OAuth): connected user_id=%s email=%s", uid(), email_address)
        return jsonify({"ok": True, "email": email_address})
    except Exception as e:
        _log.exception("Gmail mobile OAuth exchange failed")
        return err(OAUTH_EXCHANGE_FAILED, "Token exchange failed", 502, detail=str(e)[:200])


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


# ── Google Calendar (BUILD_PLAN_v2 §3.3) ────────────────
# Mirrors the Gmail mobile OAuth flow — same Google client IDs, same PKCE
# handling, just different scope (`calendar.readonly`) and API endpoints.
# Tokens stored in users_connectors as a separate row from Gmail so the
# user can connect them independently.

import gcal_sync  # noqa: E402

def _gcal_refresh_fn(refresh_token: str) -> dict:
    """Adapter for connectors.get_valid_access_token. Google returns
    expires_in (seconds-until); we compute absolute expires_at."""
    r = gcal_sync.refresh_access_token(refresh_token)
    expires_in = int(r.get("expires_in") or 3600)
    return {
        "access_token":  r.get("access_token"),
        "refresh_token": r.get("refresh_token"),  # may be None on refresh
        "expires_at":    int(time.time()) + expires_in,
    }


@app.route("/api/gcal/oauth/init", methods=["POST"])
@login_required
def api_gcal_oauth_init():
    """Issue a state token + the Google authorize URL for Calendar.
    Body: { redirect_uri }
    Returns: { ok, auth_url, state }
    """
    import oauth_state_store as _oss
    from api_errors import err, SERVER_CONFIG, VALIDATION_FAILED
    if not gcal_sync.is_configured():
        return err(SERVER_CONFIG,
                   "Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
                   400)
    data = request.get_json(silent=True) or {}
    redirect_uri = (data.get("redirect_uri") or "").strip()
    if not redirect_uri:
        return err(VALIDATION_FAILED, "redirect_uri required", 400)
    state = _oss.create_state(uid(), 'gcal', redirect_after=redirect_uri)
    auth_url = gcal_sync.get_auth_url(redirect_uri, state=state)
    return jsonify({"ok": True, "auth_url": auth_url, "state": state})


@app.route("/api/gcal/oauth/exchange", methods=["POST"])
@login_required
def api_gcal_oauth_exchange():
    """Exchange auth code for tokens, persist, run an initial sync.
    Body: { code, redirect_uri, platform?, code_verifier?, state? }
    Returns: { ok, email, sync: {fetched} }
    """
    import oauth_state_store as _oss
    import connectors as _conn
    from api_errors import err, OAUTH_STATE_INVALID, OAUTH_EXCHANGE_FAILED, VALIDATION_FAILED
    data = request.get_json(silent=True) or {}
    code = (data.get("code") or "").strip()
    state = (data.get("state") or "").strip()
    redirect_uri = (data.get("redirect_uri") or "").strip()
    platform = (data.get("platform") or "").strip().lower() or None
    code_verifier = (data.get("code_verifier") or "").strip() or None
    if not (code and redirect_uri):
        return err(VALIDATION_FAILED, "code and redirect_uri are required", 400)
    if state:
        ctx = _oss.consume_state(state, expected_provider='gcal')
        if ctx and ctx['user_id'] != uid():
            return err(OAUTH_STATE_INVALID, "OAuth state invalid", 400)
    if platform in ('ios', 'android') and not code_verifier:
        return err(VALIDATION_FAILED,
                   "code_verifier required for native OAuth (PKCE)", 400)

    try:
        tok = gcal_sync.exchange_code(
            code, redirect_uri,
            platform=platform, code_verifier=code_verifier,
        )
        access_token  = tok.get("access_token") or ""
        refresh_token = tok.get("refresh_token") or ""
        expires_in    = int(tok.get("expires_in") or 3600)
        expires_at    = int(time.time()) + expires_in
        if not access_token:
            return err(OAUTH_EXCHANGE_FAILED, "Google returned no access_token", 502)

        email = ""
        try:
            email = gcal_sync.get_user_email(access_token)
        except Exception:
            _log.exception("gcal: failed to fetch primary calendar email (non-fatal)")

        _conn.save_connector(
            uid(), 'gcal',
            access_token=access_token,
            refresh_token=refresh_token,
            expires_at=expires_at,
            scopes=gcal_sync.GCAL_SCOPES,
            external_user_id=email or None,
            status=_conn.STATUS_CONNECTED,
            last_sync_at=int(time.time()),
            last_error=None, last_error_detail=None,
        )

        # Initial sync — best-effort.
        fetched = 0
        try:
            events = gcal_sync.fetch_events(access_token)
            from db import upsert_gcal_events
            fetched = upsert_gcal_events(uid(), events)
        except Exception:
            _log.exception("gcal: initial sync failed (non-fatal)")

        _log.info("gcal OAuth: connected user_id=%s email=%s fetched=%d",
                  uid(), email, fetched)
        return jsonify({"ok": True, "email": email, "sync": {"fetched": fetched}})
    except Exception as e:
        _log.exception("gcal OAuth exchange failed")
        return err(OAUTH_EXCHANGE_FAILED, "Calendar token exchange failed",
                   502, detail=str(e)[:200])


@app.route("/api/gcal/sync", methods=["POST"])
@login_required
def api_gcal_sync():
    """Manual re-sync. Pulls yesterday + next 7 days, replaces cache."""
    import connectors as _conn
    from api_errors import err, CONNECTOR_NOT_FOUND, CONNECTOR_EXPIRED
    access_token = _conn.get_valid_access_token(uid(), 'gcal',
                                                refresh_fn=_gcal_refresh_fn)
    if not access_token:
        row = _conn.get_connector(uid(), 'gcal')
        if not row:
            return err(CONNECTOR_NOT_FOUND, "Calendar not connected", 400)
        return err(CONNECTOR_EXPIRED, "Calendar reconnect required", 401)
    try:
        events = gcal_sync.fetch_events(access_token)
        from db import upsert_gcal_events
        fetched = upsert_gcal_events(uid(), events)
        _conn.save_connector(uid(), 'gcal', last_sync_at=int(time.time()))
        return jsonify({"ok": True, "sync": {"fetched": fetched}})
    except Exception as e:
        _log.exception("gcal manual sync failed")
        _conn.mark_connector_error(uid(), 'gcal',
                                   "Calendar sync failed", str(e)[:200])
        return jsonify({"ok": False, "error": "Calendar sync failed",
                        "error_code": "upstream_unavailable"}), 502


@app.route("/api/gcal/status")
@login_required
def api_gcal_status():
    """Return cached events for today + tomorrow plus sync metadata.
    The mobile Time tab calls this on focus to render the Calendar card.
    """
    import connectors as _conn
    from db import get_gcal_events
    row = _conn.get_connector(uid(), 'gcal')
    connected = bool(row and row.get('status') == _conn.STATUS_CONNECTED)
    if not connected:
        return jsonify({"connected": False, "events": []})

    # Pull events from now → +48h. The mobile UI does its own
    # today-vs-tomorrow split using the events' start times.
    from datetime import datetime as _dt, timedelta as _td, timezone as _tz
    now_iso = _dt.now(_tz.utc).isoformat()
    end_iso = (_dt.now(_tz.utc) + _td(days=2)).isoformat()
    events = get_gcal_events(uid(), start_iso=now_iso, end_iso=end_iso, limit=30)
    return jsonify({
        "connected":     True,
        "email":         row.get('external_user_id') or '',
        "last_sync_at":  row.get('last_sync_at'),
        "events":        events,
    })


@app.route("/api/gcal/disconnect", methods=["POST"])
@login_required
def api_gcal_disconnect():
    """Revoke locally + clear cached events. (Google's token revoke
    endpoint is best-effort; we don't block on it.)"""
    import connectors as _conn
    from db import clear_gcal_events
    _conn.save_connector(
        uid(), 'gcal',
        access_token=None,
        refresh_token=None,
        expires_at=None,
        status=_conn.STATUS_REVOKED,
        last_error=None, last_error_detail=None,
    )
    clear_gcal_events(uid())
    return jsonify({"ok": True})


# ── Device-native: Health Connect (Android) ─────────────
# Phone fetches health metrics from Android Health Connect (via
# react-native-health-connect) and POSTs aggregates here. Backend
# stores them in `health_daily`. Same shape used by chatbot LifeContext
# + Fitness-tab Recovery surfaces.

@app.route("/api/health/sync", methods=["POST"])
@login_required
def api_health_sync():
    """Body: { date: 'YYYY-MM-DD', steps?, sleep_minutes?, resting_hr?,
              hrv_ms?, active_kcal? }
    Returns: { ok }
    """
    from db import upsert_health_daily
    import connectors as _conn
    data = request.get_json(silent=True) or {}
    stat_date = (data.get("date") or "").strip()
    if not stat_date:
        return jsonify({"ok": False, "error": "date required",
                        "error_code": "validation_failed"}), 400

    def _to_int(v):
        try:
            return int(v) if v is not None else None
        except (TypeError, ValueError):
            return None

    upsert_health_daily(
        uid(), stat_date,
        steps=_to_int(data.get("steps")),
        sleep_minutes=_to_int(data.get("sleep_minutes")),
        resting_hr=_to_int(data.get("resting_hr")),
        hrv_ms=_to_int(data.get("hrv_ms")),
        active_kcal=_to_int(data.get("active_kcal")),
    )
    # Mark connector as connected + bump last_sync_at. Both 'healthkit'
    # and 'health_connect' provider rows share this sync since the
    # mobile hook abstracts which platform we're on.
    try:
        provider = 'health_connect' if (data.get("platform") == 'android') else 'healthkit'
        _conn.save_connector(uid(), provider,
                             status=_conn.STATUS_CONNECTED,
                             last_sync_at=int(time.time()),
                             last_error=None, last_error_detail=None)
    except Exception:
        _log.exception("health/sync: connector mark failed (non-fatal)")
    return jsonify({"ok": True})


@app.route("/api/health/today")
@login_required
def api_health_today():
    """Returns today's HC aggregates + 7-day history."""
    from db import get_health_daily, get_health_history
    today = client_today()
    return jsonify({
        "today":   get_health_daily(uid(), today) or {},
        "history": get_health_history(uid(), days=7),
    })


# ── Device-native: Location ─────────────────────────────
# Foreground-only for v1. Mobile pushes a sample on app open + every
# 15 min when the app is foregrounded. Background sampling = v1.1
# (Apple/Google scrutinize background-location apps heavily).

@app.route("/api/location/sync", methods=["POST"])
@login_required
def api_location_sync():
    """Body: { samples: [ { lat, lon, accuracy_m?, sampled_at?, source? } ] }"""
    from db import insert_location_samples
    import connectors as _conn
    data = request.get_json(silent=True) or {}
    samples = data.get("samples") or []
    if not isinstance(samples, list) or not samples:
        return jsonify({"ok": False, "error": "samples array required",
                        "error_code": "validation_failed"}), 400
    inserted = insert_location_samples(uid(), samples)
    try:
        _conn.save_connector(uid(), 'location',
                             status=_conn.STATUS_CONNECTED,
                             last_sync_at=int(time.time()),
                             last_error=None, last_error_detail=None)
    except Exception:
        _log.exception("location/sync: connector mark failed (non-fatal)")
    return jsonify({"ok": True, "inserted": inserted})


@app.route("/api/location/today")
@login_required
def api_location_today():
    """Today's location summary: visits with reverse-geocoded place
    names, top recurring clusters, sample count + last sample, plus a
    Google Static Maps URL for the day's path.

    Heavy work (visit detection + geocoding) only fires when the
    client asks for it via this endpoint — caching on cluster rows
    keeps repeat calls cheap.
    """
    from db import get_recent_location_samples, count_location_samples_today, list_location_clusters
    import location_engine

    today = client_today()
    samples_today = count_location_samples_today(uid(), today)
    recent = get_recent_location_samples(uid(), limit=1)
    last = recent[0] if recent else None

    # Pipeline: detect visits → update clusters → geocode pending →
    # build map URL. Bounded geocoding cost (5 cluster reverse-lookups
    # max per call).
    pipeline = location_engine.process_day(uid(), today)

    # Top recurring clusters (lifetime, not today-specific). Auto-label
    # the top dwell cluster as "home" if user hasn't labeled anything
    # yet — cheap heuristic, user can override via place_label.
    clusters = list_location_clusters(uid(), limit=5)

    # Strip private fields for the client (no need to ship sample_count
    # and timestamps; the UI just wants names + labels + dwell).
    cluster_summary = [
        {
            "id":                  int(c["id"]),
            "place_name":          c.get("place_name"),
            "place_label":         c.get("place_label"),
            "total_dwell_minutes": int(c.get("total_dwell_minutes") or 0),
            "centroid_lat":        c.get("centroid_lat"),
            "centroid_lon":        c.get("centroid_lon"),
        }
        for c in clusters
    ]

    return jsonify({
        "samples_today":  samples_today,
        "last_sample":    last,
        "visits":         pipeline["visits"],
        "map_url":        pipeline["map_url"],
        "clusters":       cluster_summary,
        "has_maps_api_key": pipeline["has_api_key"],
    })


@app.route("/api/location/clusters", methods=["GET"])
@login_required
def api_location_clusters():
    """Lightweight cluster list for forms that need to pick a cluster
    (e.g. TIME-06 goal config). No reverse-geocoding side effects —
    `/api/location/today` runs the heavy pipeline; this one just reads
    the rows ranked by dwell minutes. ?limit= caps results (default 20)."""
    from db import list_location_clusters
    limit = max(1, min(int(request.args.get("limit", 20)), 100))
    rows = list_location_clusters(uid(), limit=limit)
    return jsonify({
        "clusters": [
            {
                "id":                  int(r["id"]),
                "place_name":          r.get("place_name"),
                "place_label":         r.get("place_label"),
                "total_dwell_minutes": int(r.get("total_dwell_minutes") or 0),
                "centroid_lat":        r.get("centroid_lat"),
                "centroid_lon":        r.get("centroid_lon"),
            }
            for r in rows
        ],
    })


# ── Day Timeline (PRD §4.6.5 revised) ────────────────────

@app.route("/api/day-timeline/<date_iso>", methods=["GET"])
@login_required
def api_day_timeline(date_iso: str):
    """Day Timeline blocks for a date — deterministic hard blocks
    from calendar events. Soft-block AI labeling is §14.2.2 (queued).

    `date_iso`: 'YYYY-MM-DD' in the user's local timezone (caller's
    responsibility — same convention as /api/health/today).

    v1: recomputes on read (cheap; <50 events typical). Cron-driven
    job is post-launch optimization."""
    import day_timeline
    safe_date = day_timeline.parse_date(date_iso)
    try:
        blocks = day_timeline.recompute_day_timeline(uid(), safe_date)
    except Exception as e:
        _log.exception("day_timeline recompute failed (%s)", safe_date)
        return jsonify({"ok": False, "error": "Could not compute timeline",
                        "error_code": "compute_failed",
                        "detail": str(e)[:200]}), 500
    # Strip internal-only fields for the client. Parse source_json so
    # the client doesn't have to.
    out = []
    for b in blocks:
        raw_src = b.get("source_json") or ""
        try:
            src = json.loads(raw_src) if raw_src else None
        except Exception:
            src = None
        out.append({
            "id":          int(b["id"]),
            "block_start": b["block_start"],
            "block_end":   b["block_end"],
            "kind":        b["kind"],
            "label":       b.get("label"),
            "confidence":  b.get("confidence"),
            "source_type": b.get("source_type"),
            "source":      src,
        })
    return jsonify({
        "date":   safe_date,
        "blocks": out,
    })


# ── Device-native: Android Screen Time ──────────────────
# Mobile uses UsageStatsManager (requires user to grant Usage Access in
# system Settings) and POSTs daily aggregates. Backend stores in
# screen_time_daily. iOS counterpart (Apple Family Controls) is gated
# on the Apple distribution entitlement and is a separate flow.

@app.route("/api/screen-time/sync", methods=["POST"])
@login_required
def api_screen_time_sync():
    """Body: {
      date:                 'YYYY-MM-DD',
      total_minutes:        int,
      pickups?:             int,
      longest_session_min?: int,
      top_apps?:            [ { package, label, minutes } ]
    }
    """
    from db import upsert_screen_time_daily
    import connectors as _conn
    data = request.get_json(silent=True) or {}
    stat_date = (data.get("date") or "").strip()
    total = data.get("total_minutes")
    if not stat_date or total is None:
        return jsonify({"ok": False, "error": "date and total_minutes required",
                        "error_code": "validation_failed"}), 400
    try:
        total_int = int(total)
    except (TypeError, ValueError):
        return jsonify({"ok": False, "error": "total_minutes must be int",
                        "error_code": "validation_failed"}), 400

    top_apps = data.get("top_apps")
    top_apps_json = json.dumps(top_apps[:10]) if isinstance(top_apps, list) else None

    def _opt_int(v):
        try:
            return int(v) if v is not None else None
        except (TypeError, ValueError):
            return None

    upsert_screen_time_daily(
        uid(), stat_date,
        total_minutes=total_int,
        pickups=_opt_int(data.get("pickups")),
        top_apps_json=top_apps_json,
        longest_session_min=_opt_int(data.get("longest_session_min")),
    )
    try:
        _conn.save_connector(uid(), 'android_usage_stats',
                             status=_conn.STATUS_CONNECTED,
                             last_sync_at=int(time.time()),
                             last_error=None, last_error_detail=None)
    except Exception:
        _log.exception("screen-time/sync: connector mark failed (non-fatal)")
    return jsonify({"ok": True})


@app.route("/api/screen-time/today")
@login_required
def api_screen_time_today():
    """Today's aggregate + 7-day history. top_apps_json is parsed back to
    a list for the client."""
    from db import get_screen_time_daily, get_screen_time_history
    today = client_today()
    today_row = get_screen_time_daily(uid(), today) or {}
    history = get_screen_time_history(uid(), days=7)

    def _hydrate(row):
        if not row:
            return row
        try:
            row["top_apps"] = json.loads(row.get("top_apps_json") or "[]")
        except Exception:
            row["top_apps"] = []
        row.pop("top_apps_json", None)
        return row

    return jsonify({
        "today":   _hydrate(today_row),
        "history": [_hydrate(dict(r)) for r in history],
    })


# ── Outlook (BUILD_PLAN_v2 §3.4) ────────────────────────
# Microsoft Graph delivers BOTH mail and calendar under one token, so
# Outlook is a single connector row (vs Google's split). Pattern mirrors
# Gmail/Calendar otherwise — PKCE on the mobile side, client_secret on
# the backend, tokens in users_connectors.

import outlook_sync  # noqa: E402

def _outlook_refresh_fn(refresh_token: str) -> dict:
    r = outlook_sync.refresh_access_token(refresh_token)
    expires_in = int(r.get("expires_in") or 3600)
    return {
        "access_token":  r.get("access_token"),
        # Microsoft rotates refresh_tokens — always persist the new one.
        "refresh_token": r.get("refresh_token"),
        "expires_at":    int(time.time()) + expires_in,
    }


@app.route("/api/outlook/oauth/init", methods=["POST"])
@login_required
def api_outlook_oauth_init():
    """Issue a state token + the Microsoft authorize URL.
    Body: { redirect_uri }
    """
    import oauth_state_store as _oss
    from api_errors import err, SERVER_CONFIG, VALIDATION_FAILED
    if not outlook_sync.is_configured():
        return err(SERVER_CONFIG,
                   "Outlook OAuth not configured. Set MS_CLIENT_ID and MS_CLIENT_SECRET.",
                   400)
    data = request.get_json(silent=True) or {}
    redirect_uri = (data.get("redirect_uri") or "").strip()
    if not redirect_uri:
        return err(VALIDATION_FAILED, "redirect_uri required", 400)
    state = _oss.create_state(uid(), 'outlook', redirect_after=redirect_uri)
    auth_url = outlook_sync.get_auth_url(redirect_uri, state=state)
    return jsonify({"ok": True, "auth_url": auth_url, "state": state})


@app.route("/api/outlook/oauth/exchange", methods=["POST"])
@login_required
def api_outlook_oauth_exchange():
    """Exchange auth code for tokens, persist, run an initial sync of
    both mail (last 7 days) and calendar (yesterday + 7 days).
    Body: { code, redirect_uri, code_verifier?, state? }
    """
    import oauth_state_store as _oss
    import connectors as _conn
    from api_errors import err, OAUTH_STATE_INVALID, OAUTH_EXCHANGE_FAILED, VALIDATION_FAILED
    data = request.get_json(silent=True) or {}
    code = (data.get("code") or "").strip()
    state = (data.get("state") or "").strip()
    redirect_uri = (data.get("redirect_uri") or "").strip()
    code_verifier = (data.get("code_verifier") or "").strip() or None
    if not (code and redirect_uri):
        return err(VALIDATION_FAILED, "code and redirect_uri are required", 400)
    if state:
        ctx = _oss.consume_state(state, expected_provider='outlook')
        if ctx and ctx['user_id'] != uid():
            return err(OAUTH_STATE_INVALID, "OAuth state invalid", 400)

    try:
        tok = outlook_sync.exchange_code(code, redirect_uri, code_verifier=code_verifier)
        access_token  = tok.get("access_token") or ""
        refresh_token = tok.get("refresh_token") or ""
        expires_in    = int(tok.get("expires_in") or 3600)
        expires_at    = int(time.time()) + expires_in
        if not access_token:
            return err(OAUTH_EXCHANGE_FAILED, "Microsoft returned no access_token", 502)

        # Fetch profile for external_user_id (their email + display name).
        email = ""
        display_name = ""
        try:
            profile = outlook_sync.get_user_profile(access_token)
            email = profile.get("mail") or profile.get("userPrincipalName") or ""
            display_name = profile.get("displayName") or ""
        except Exception:
            _log.exception("outlook: profile fetch failed (non-fatal)")

        _conn.save_connector(
            uid(), 'outlook',
            access_token=access_token,
            refresh_token=refresh_token,
            expires_at=expires_at,
            scopes=outlook_sync.OUTLOOK_SCOPES,
            external_user_id=email or display_name or None,
            status=_conn.STATUS_CONNECTED,
            last_sync_at=int(time.time()),
            last_error=None, last_error_detail=None,
        )

        # Initial sync — best effort. Failure here doesn't fail the
        # connection; user can retry from /sync.
        sync_result = {"emails": 0, "events": 0}
        try:
            from db import upsert_outlook_emails, upsert_outlook_events
            emails = outlook_sync.fetch_recent_emails(access_token)
            events = outlook_sync.fetch_events(access_token)
            sync_result["emails"] = upsert_outlook_emails(uid(), emails)
            sync_result["events"] = upsert_outlook_events(uid(), events)
        except Exception:
            _log.exception("outlook: initial sync failed (non-fatal)")

        _log.info("Outlook OAuth: connected user_id=%s email=%s sync=%s",
                  uid(), email, sync_result)
        return jsonify({
            "ok":      True,
            "email":   email,
            "name":    display_name,
            "sync":    sync_result,
        })
    except Exception as e:
        _log.exception("Outlook OAuth exchange failed")
        return err(OAUTH_EXCHANGE_FAILED, "Outlook token exchange failed",
                   502, detail=str(e)[:200])


@app.route("/api/outlook/sync", methods=["POST"])
@login_required
def api_outlook_sync():
    """Manual re-sync — refreshes both mail and calendar caches."""
    import connectors as _conn
    from api_errors import err, CONNECTOR_NOT_FOUND, CONNECTOR_EXPIRED
    access_token = _conn.get_valid_access_token(uid(), 'outlook',
                                                refresh_fn=_outlook_refresh_fn)
    if not access_token:
        row = _conn.get_connector(uid(), 'outlook')
        if not row:
            return err(CONNECTOR_NOT_FOUND, "Outlook not connected", 400)
        return err(CONNECTOR_EXPIRED, "Outlook reconnect required", 401)
    try:
        from db import upsert_outlook_emails, upsert_outlook_events
        emails = outlook_sync.fetch_recent_emails(access_token)
        events = outlook_sync.fetch_events(access_token)
        emails_count = upsert_outlook_emails(uid(), emails)
        events_count = upsert_outlook_events(uid(), events)
        _conn.save_connector(uid(), 'outlook', last_sync_at=int(time.time()))
        return jsonify({"ok": True, "sync": {"emails": emails_count, "events": events_count}})
    except Exception as e:
        _log.exception("Outlook manual sync failed")
        _conn.mark_connector_error(uid(), 'outlook',
                                   "Outlook sync failed", str(e)[:200])
        return jsonify({"ok": False, "error": "Outlook sync failed",
                        "error_code": "upstream_unavailable"}), 502


@app.route("/api/outlook/status")
@login_required
def api_outlook_status():
    """Return Outlook connection status + cached emails/events for Time tab."""
    import connectors as _conn
    from db import get_outlook_emails, get_outlook_events
    row = _conn.get_connector(uid(), 'outlook')
    connected = bool(row and row.get('status') == _conn.STATUS_CONNECTED)
    if not connected:
        return jsonify({"connected": False, "emails": [], "events": []})

    # Events: now → +48h (matches gcal/status pattern)
    from datetime import datetime as _dt, timedelta as _td, timezone as _tz
    now_iso = _dt.now(_tz.utc).isoformat()
    end_iso = (_dt.now(_tz.utc) + _td(days=2)).isoformat()
    events = get_outlook_events(uid(), start_iso=now_iso, end_iso=end_iso, limit=30)
    emails = get_outlook_emails(uid(), limit=20)

    return jsonify({
        "connected":    True,
        "email":        row.get('external_user_id') or '',
        "last_sync_at": row.get('last_sync_at'),
        "events":       events,
        "emails":       emails,
        "unread_count": sum(1 for e in emails if not e.get("is_read")),
    })


@app.route("/api/outlook/disconnect", methods=["POST"])
@login_required
def api_outlook_disconnect():
    """Revoke locally + clear cached emails/events. Microsoft also has a
    /me/oauth2PermissionGrants delete endpoint but it's user-flow heavy;
    local revoke is enough — when the user reconnects they'll get a fresh
    token and tokens left dangling expire on their own."""
    import connectors as _conn
    from db import clear_outlook_emails, clear_outlook_events
    _conn.save_connector(
        uid(), 'outlook',
        access_token=None,
        refresh_token=None,
        expires_at=None,
        status=_conn.STATUS_REVOKED,
        last_error=None, last_error_detail=None,
    )
    clear_outlook_emails(uid())
    clear_outlook_events(uid())
    return jsonify({"ok": True})


# ── Strava (BUILD_PLAN_v2 §3.6) ─────────────────────────
# Strava is OAuth 2.0 with a real client_secret (no PKCE), so the mobile
# flow is simpler than Gmail: client opens the consent URL, captures the
# `code` from the deep-link callback, posts {code, redirect_uri} here.
# Tokens live in users_connectors only (no legacy table).

import strava_sync  # noqa: E402

def _strava_refresh_fn(refresh_token: str) -> dict:
    """Adapter from strava_sync.refresh_access_token's response shape to the
    contract connectors.get_valid_access_token expects.
    Strava already returns expires_at as unix seconds — no conversion."""
    r = strava_sync.refresh_access_token(refresh_token)
    return {
        "access_token":  r.get("access_token"),
        "refresh_token": r.get("refresh_token"),
        "expires_at":    int(r.get("expires_at") or 0),
    }


@app.route("/api/strava/oauth/init", methods=["POST"])
@login_required
def api_strava_oauth_init():
    """Issue an oauth_states token + the Strava authorize URL.
    Body: { redirect_uri }  e.g. "lifedashboard://strava-callback"
    Returns: { ok, auth_url, state }
    """
    import oauth_state_store as _oss
    from api_errors import err, SERVER_CONFIG, VALIDATION_FAILED
    if not strava_sync.is_configured():
        return err(SERVER_CONFIG,
                   "Strava OAuth not configured. Set STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET.",
                   400)
    data = request.get_json(silent=True) or {}
    redirect_uri = (data.get("redirect_uri") or "").strip()
    if not redirect_uri:
        return err(VALIDATION_FAILED, "redirect_uri required", 400)
    state = _oss.create_state(uid(), 'strava', redirect_after=redirect_uri)
    auth_url = strava_sync.get_auth_url(redirect_uri, state=state, mobile=True)
    return jsonify({"ok": True, "auth_url": auth_url, "state": state})


@app.route("/api/strava/oauth/exchange", methods=["POST"])
@login_required
def api_strava_oauth_exchange():
    """Exchange the auth code for tokens, store in users_connectors, kick off
    a 90-day backfill.

    Body: { code, redirect_uri, state? }
    Returns: { ok, athlete: {id, firstname, lastname, ...}, sync: {fetched, inserted, skipped} }
    """
    import oauth_state_store as _oss
    import connectors as _conn
    from api_errors import err, OAUTH_STATE_INVALID, OAUTH_EXCHANGE_FAILED, VALIDATION_FAILED
    data = request.get_json(silent=True) or {}
    code = (data.get("code") or "").strip()
    state = (data.get("state") or "").strip()
    redirect_uri = (data.get("redirect_uri") or "").strip()
    if not (code and redirect_uri):
        return err(VALIDATION_FAILED, "code and redirect_uri are required", 400)

    # If the mobile flow used /init, validate + consume the state token.
    # If it didn't (custom client-managed state), we accept whatever was
    # passed — Strava's OAuth security model relies on the client_secret
    # held server-side, so state is CSRF protection only.
    if state:
        ctx = _oss.consume_state(state, expected_provider='strava')
        if ctx and ctx['user_id'] != uid():
            return err(OAUTH_STATE_INVALID, "OAuth state invalid", 400)

    try:
        tok = strava_sync.exchange_code(code)
        access_token  = tok.get("access_token") or ""
        refresh_token = tok.get("refresh_token") or ""
        expires_at    = int(tok.get("expires_at") or 0)
        athlete       = tok.get("athlete") or {}
        athlete_id    = str(athlete.get("id") or "")
        if not access_token:
            return err(OAUTH_EXCHANGE_FAILED, "Strava returned no access_token", 502)

        _conn.save_connector(
            uid(), 'strava',
            access_token=access_token,
            refresh_token=refresh_token,
            expires_at=expires_at or None,
            scopes=strava_sync.STRAVA_SCOPES,
            external_user_id=athlete_id or None,
            status=_conn.STATUS_CONNECTED,
            last_sync_at=int(time.time()),
            last_error=None,
            last_error_detail=None,
        )

        # Initial backfill — last 90 days. Best-effort: if it fails, the
        # connection is still considered successful (user can retry sync
        # from the connections screen).
        sync_result = {"fetched": 0, "inserted": 0, "skipped": 0}
        try:
            sync_result = strava_sync.sync_user_activities(uid(), access_token)
        except Exception:
            _log.exception("Strava: initial backfill failed (non-fatal)")

        _log.info("Strava OAuth: connected user_id=%s athlete_id=%s sync=%s",
                  uid(), athlete_id, sync_result)
        return jsonify({"ok": True, "athlete": athlete, "sync": sync_result})
    except Exception as e:
        _log.exception("Strava OAuth exchange failed")
        return err(OAUTH_EXCHANGE_FAILED, "Strava token exchange failed",
                   502, detail=str(e)[:200])


@app.route("/api/strava/sync", methods=["POST"])
@login_required
def api_strava_sync():
    """Manual re-sync. Pulls last 90 days, deduped against strava_activity_id.
    Returns: { ok, sync: {fetched, inserted, skipped} }
    """
    import connectors as _conn
    from api_errors import err, CONNECTOR_NOT_FOUND, CONNECTOR_EXPIRED
    access_token = _conn.get_valid_access_token(uid(), 'strava',
                                                refresh_fn=_strava_refresh_fn)
    if not access_token:
        row = _conn.get_connector(uid(), 'strava')
        if not row:
            return err(CONNECTOR_NOT_FOUND, "Strava not connected", 400)
        return err(CONNECTOR_EXPIRED, "Strava reconnect required", 401)
    try:
        sync_result = strava_sync.sync_user_activities(uid(), access_token)
        _conn.save_connector(uid(), 'strava', last_sync_at=int(time.time()))
        return jsonify({"ok": True, "sync": sync_result})
    except Exception as e:
        _log.exception("Strava manual sync failed")
        _conn.mark_connector_error(uid(), 'strava',
                                   "Strava sync failed", str(e)[:200])
        return jsonify({"ok": False, "error": "Strava sync failed",
                        "error_code": "upstream_unavailable"}), 502


@app.route("/api/strava/activity/<activity_id>", methods=["GET"])
@login_required
def api_strava_activity_detail(activity_id: str):
    """Detailed view of a single Strava activity: polyline + splits +
    HR zones + downsampled streams (HR / altitude / distance) for
    chart rendering.

    Lazy-fetched: the first hit pulls /activities/{id}, /streams, and
    /zones from Strava and stores in `strava_activity_detail`.
    Subsequent hits return the cached row immediately. Pass
    `?refresh=1` to force a re-fetch from Strava.

    Path param `activity_id` matches `workout_logs.strava_activity_id`.
    """
    import connectors as _conn
    import json as _json
    from db import get_strava_detail, upsert_strava_detail
    from api_errors import err, CONNECTOR_NOT_FOUND, CONNECTOR_EXPIRED, NOT_FOUND

    activity_id = (activity_id or "").strip()
    if not activity_id:
        return err(NOT_FOUND, "Missing activity_id", 404)

    refresh = request.args.get("refresh", "").lower() in ("1", "true")
    cached = get_strava_detail(uid(), activity_id) if not refresh else None
    if cached:
        # Hydrate JSON columns on the way out so the client gets
        # parsed structures instead of raw strings.
        cached = _hydrate_strava_detail(cached)
        cached["map_url"] = _strava_static_map_url(cached.get("polyline"))
        return jsonify(cached)

    access_token = _conn.get_valid_access_token(uid(), 'strava',
                                                refresh_fn=_strava_refresh_fn)
    if not access_token:
        row = _conn.get_connector(uid(), 'strava')
        if not row:
            return err(CONNECTOR_NOT_FOUND, "Strava not connected", 400)
        return err(CONNECTOR_EXPIRED, "Strava reconnect required", 401)

    try:
        raw = strava_sync.fetch_activity_detail(access_token, activity_id)
        streams = strava_sync.fetch_activity_streams(access_token, activity_id)
        zones = strava_sync.fetch_activity_zones(access_token, activity_id)
    except Exception as e:
        _log.exception("strava activity detail fetch failed (%s)", activity_id)
        return jsonify({"ok": False, "error": "Strava detail fetch failed",
                        "error_code": "upstream_unavailable",
                        "detail": str(e)[:200]}), 502

    # Compact streams: pull just hr / altitude / distance arrays,
    # downsampled to ~60 points for cheap chart rendering. Strava can
    # return either {hr: {data: [...]}} (key_by_type=true) or
    # [{type: 'heartrate', data: [...]}, ...]. Tolerate both.
    compact_streams = _extract_streams(streams)

    polyline = (raw.get("map") or {}).get("polyline") or (raw.get("map") or {}).get("summary_polyline") or ""
    splits = raw.get("splits_standard") or raw.get("splits_metric") or []

    fields = {
        "activity_type":    raw.get("type") or "",
        "polyline":         polyline,
        "distance_m":       float(raw.get("distance") or 0) or None,
        "moving_time_s":    int(raw.get("moving_time") or 0) or None,
        "elapsed_time_s":   int(raw.get("elapsed_time") or 0) or None,
        "elevation_gain_m": float(raw.get("total_elevation_gain") or 0) or None,
        "avg_hr":           int(raw["average_heartrate"]) if raw.get("average_heartrate") else None,
        "max_hr":           int(raw["max_heartrate"]) if raw.get("max_heartrate") else None,
        "avg_speed_mps":    float(raw.get("average_speed") or 0) or None,
        "max_speed_mps":    float(raw.get("max_speed") or 0) or None,
        "avg_watts":        float(raw["average_watts"]) if raw.get("average_watts") else None,
        "splits_json":      _json.dumps(splits),
        "zones_json":       _json.dumps(zones),
        "streams_json":     _json.dumps(compact_streams),
    }
    upsert_strava_detail(uid(), activity_id, fields)

    detail = get_strava_detail(uid(), activity_id) or {}
    detail = _hydrate_strava_detail(detail)
    detail["map_url"] = _strava_static_map_url(polyline)
    return jsonify(detail)


def _hydrate_strava_detail(row: dict) -> dict:
    """Parse JSON columns into native lists/objects for the client."""
    import json as _json
    out = dict(row)
    for col in ("splits_json", "zones_json", "streams_json"):
        raw = out.get(col)
        client_key = col.replace("_json", "")
        try:
            out[client_key] = _json.loads(raw) if raw else None
        except Exception:
            out[client_key] = None
        out.pop(col, None)
    return out


def _extract_streams(streams: dict | list) -> dict:
    """Normalize Strava's two stream-response shapes into:
      { heartrate: [...], altitude: [...], distance: [...] }
    Each downsampled to ~60 points. Empty when no streams available."""
    out: dict[str, list] = {}
    if not streams:
        return out
    if isinstance(streams, dict):
        # New shape: {hr: {data: [...]}, altitude: {data: [...]}, ...}
        for stream_name, key in (("heartrate", "heartrate"),
                                  ("altitude",  "altitude"),
                                  ("distance",  "distance")):
            blob = streams.get(stream_name)
            if isinstance(blob, dict):
                data = blob.get("data") or []
                out[key] = strava_sync.downsample_stream(data)
    elif isinstance(streams, list):
        # Legacy shape: [{type: 'heartrate', data: [...]}, ...]
        for s in streams:
            stype = s.get("type")
            if stype in ("heartrate", "altitude", "distance"):
                out[stype] = strava_sync.downsample_stream(s.get("data") or [])
    return out


def _strava_static_map_url(polyline: str | None) -> str | None:
    """Build a Google Static Maps URL drawing the route polyline.
    Strava returns Google-encoded polylines, so we pass them straight
    through as `path=enc:<polyline>` — no decoding step needed.
    Returns None if no polyline or no GOOGLE_MAPS_API_KEY configured."""
    api_key = os.environ.get("GOOGLE_MAPS_API_KEY", "")
    if not (polyline and api_key):
        return None
    from urllib.parse import quote
    # Static Maps auto-fits when no center/zoom + a path — let it.
    base = "https://maps.googleapis.com/maps/api/staticmap"
    return (
        f"{base}?size=600x300&scale=2&maptype=roadmap"
        f"&path=color:0x4F46E5FF|weight:4|enc:{quote(polyline)}"
        f"&key={api_key}"
    )


@app.route("/api/strava/disconnect", methods=["POST"])
@login_required
def api_strava_disconnect():
    """Revoke Strava access — deauthorize upstream + flip local row to revoked.
    Existing imported activities stay in workout_logs."""
    import connectors as _conn
    row = _conn.get_connector(uid(), 'strava')
    if row and row.get('access_token'):
        strava_sync.deauthorize(row['access_token'])
    _conn.save_connector(
        uid(), 'strava',
        access_token=None,
        refresh_token=None,
        expires_at=None,
        status=_conn.STATUS_REVOKED,
        last_error=None,
        last_error_detail=None,
    )
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


# ── Finance (PRD §4.5) ────────────────────────────────────────────────────
# Manual-first: user types transactions, sets budgets, tracks bills. Every
# route tolerates "no Plaid" as a first-class state. When Plaid lands,
# its sync path just INSERTs into the same tables with source='plaid'.

@app.route("/api/finance/summary", methods=["GET"])
@login_required
def api_finance_summary():
    """Hot-path read for the Finance tab — every number on the Today view
    comes from here so the client doesn't do N+1 fetches."""
    import finance as _fin
    return jsonify({"ok": True, **_fin.finance_summary(uid())})


@app.route("/api/finance/accounts", methods=["GET", "POST"])
@login_required
def api_finance_accounts():
    import finance as _fin
    if request.method == "GET":
        return jsonify({"ok": True, "accounts": _fin.list_accounts(uid())})
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"ok": False, "error": "name required",
                        "error_code": "validation_failed"}), 400
    account_type = data.get("account_type", "cash")
    current_balance = data.get("current_balance")
    try:
        acct_id = _fin.create_manual_account(
            uid(), name=name, account_type=account_type,
            current_balance=(float(current_balance) if current_balance is not None else None),
        )
    except Exception:
        _log.exception("finance/accounts POST failed")
        return jsonify({"ok": False, "error": "Could not create account",
                        "error_code": "db_error"}), 500
    return jsonify({"ok": True, "account_id": acct_id}), 201


@app.route("/api/finance/accounts/<int:account_id>/balance", methods=["PUT"])
@login_required
def api_finance_account_balance(account_id: int):
    import finance as _fin
    data = request.get_json(silent=True) or {}
    bal = data.get("current_balance")
    if bal is None:
        return jsonify({"ok": False, "error": "current_balance required",
                        "error_code": "validation_failed"}), 400
    try:
        ok = _fin.update_account_balance(account_id, uid(), float(bal))
    except (TypeError, ValueError):
        return jsonify({"ok": False, "error": "Invalid balance",
                        "error_code": "validation_failed"}), 400
    if not ok:
        return jsonify({"ok": False, "error": "Account not found",
                        "error_code": "not_found"}), 404
    return jsonify({"ok": True})


@app.route("/api/finance/transactions", methods=["GET", "POST"])
@login_required
def api_finance_transactions():
    import finance as _fin
    if request.method == "GET":
        try:
            limit = int(request.args.get("limit", 50))
        except (TypeError, ValueError):
            limit = 50
        limit = max(1, min(limit, 200))
        since = request.args.get("since")
        category = request.args.get("category")
        rows = _fin.list_transactions(uid(), limit=limit, since=since, category=category)
        return jsonify({"ok": True, "transactions": rows})

    data = request.get_json(silent=True) or {}
    try:
        amount = float(data.get("amount"))
    except (TypeError, ValueError):
        return jsonify({"ok": False, "error": "amount required (numeric)",
                        "error_code": "validation_failed"}), 400
    if amount == 0:
        return jsonify({"ok": False, "error": "amount cannot be zero",
                        "error_code": "validation_failed"}), 400
    txn_date = data.get("txn_date") or client_today()
    category = data.get("category", "other")
    try:
        txn_id = _fin.create_transaction(
            uid(),
            amount=amount,
            txn_date=txn_date,
            merchant_name=data.get("merchant_name"),
            category=category,
            account_id=data.get("account_id"),
            note=data.get("note"),
        )
    except ValueError as e:
        return jsonify({"ok": False, "error": str(e),
                        "error_code": "validation_failed"}), 400
    except Exception:
        _log.exception("finance/transactions POST failed")
        return jsonify({"ok": False, "error": "Could not save transaction",
                        "error_code": "db_error"}), 500
    return jsonify({"ok": True, "transaction_id": txn_id}), 201


@app.route("/api/finance/transactions/<int:txn_id>", methods=["PATCH", "DELETE"])
@login_required
def api_finance_transaction(txn_id: int):
    import finance as _fin
    if request.method == "DELETE":
        ok = _fin.delete_transaction(txn_id, uid())
        if not ok:
            return jsonify({"ok": False, "error": "Transaction not found",
                            "error_code": "not_found"}), 404
        return jsonify({"ok": True})
    data = request.get_json(silent=True) or {}
    try:
        ok = _fin.update_transaction(txn_id, uid(), data)
    except ValueError as e:
        return jsonify({"ok": False, "error": str(e),
                        "error_code": "validation_failed"}), 400
    if not ok:
        return jsonify({"ok": False, "error": "Nothing updated",
                        "error_code": "validation_failed"}), 400
    return jsonify({"ok": True})


@app.route("/api/finance/budget", methods=["GET", "PUT", "DELETE"])
@login_required
def api_finance_budget():
    """GET: return all categories' caps. PUT: upsert one category. DELETE:
    remove one category (query param ?category=)."""
    import finance as _fin
    if request.method == "GET":
        return jsonify({"ok": True, "budgets": _fin.get_budgets(uid())})
    if request.method == "PUT":
        data = request.get_json(silent=True) or {}
        category = (data.get("category") or "").strip()
        cap = data.get("monthly_cap")
        try:
            _fin.set_budget(uid(), category, float(cap))
        except (TypeError, ValueError) as e:
            return jsonify({"ok": False, "error": str(e),
                            "error_code": "validation_failed"}), 400
        return jsonify({"ok": True})
    # DELETE
    category = (request.args.get("category") or "").strip()
    if not category:
        return jsonify({"ok": False, "error": "category required",
                        "error_code": "validation_failed"}), 400
    _fin.delete_budget(uid(), category)
    return jsonify({"ok": True})


@app.route("/api/finance/bills", methods=["GET", "POST"])
@login_required
def api_finance_bills():
    import finance as _fin
    if request.method == "GET":
        include_paid = request.args.get("include_paid", "1") != "0"
        return jsonify({"ok": True, "bills": _fin.list_bills(uid(), include_paid=include_paid)})
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    due_date = (data.get("due_date") or "").strip()
    if not name or not due_date:
        return jsonify({"ok": False, "error": "name and due_date required",
                        "error_code": "validation_failed"}), 400
    try:
        amount = data.get("amount")
        amount_f = float(amount) if amount is not None else None
        bill_id = _fin.create_bill(
            uid(), name=name, amount=amount_f, due_date=due_date,
            frequency=data.get("frequency", "monthly"),
            account_id=data.get("account_id"),
            note=data.get("note"),
        )
    except ValueError as e:
        return jsonify({"ok": False, "error": str(e),
                        "error_code": "validation_failed"}), 400
    except Exception:
        _log.exception("finance/bills POST failed")
        return jsonify({"ok": False, "error": "Could not create bill",
                        "error_code": "db_error"}), 500
    return jsonify({"ok": True, "bill_id": bill_id}), 201


@app.route("/api/finance/bills/<int:bill_id>/mark-paid", methods=["POST"])
@login_required
def api_finance_bill_mark_paid(bill_id: int):
    import finance as _fin
    data = request.get_json(silent=True) or {}
    result = _fin.mark_bill_paid(bill_id, uid(), paid_date=data.get("paid_date"))
    if not result:
        return jsonify({"ok": False, "error": "Bill not found",
                        "error_code": "not_found"}), 404
    return jsonify({"ok": True, "bill": result})


@app.route("/api/finance/bills/<int:bill_id>", methods=["DELETE"])
@login_required
def api_finance_bill_delete(bill_id: int):
    import finance as _fin
    ok = _fin.delete_bill(bill_id, uid())
    if not ok:
        return jsonify({"ok": False, "error": "Bill not found",
                        "error_code": "not_found"}), 404
    return jsonify({"ok": True})


# ── Connector foundation (PRD §4.8.6 + BUILD_PLAN_v2 §2) ─────────────────
# Per-provider state lives in users_connectors. This cycle ships the
# catalog + CRUD + disconnect; actual OAuth flows land in Phase C1.

@app.route("/api/connectors", methods=["GET"])
@login_required
def api_connectors_list():
    """Return the full catalog + user-specific state for each entry.

    Shape: [{ provider, display_name, description, category, kind, icon,
              ships_in_phase, note, platforms,
              status, last_sync_at, last_error, external_user_id, scopes }]

    Mobile renders Settings → Connections + the onboarding connections
    screen directly from this.
    """
    import connectors as _conn
    rows = {r['provider']: r for r in _conn.list_connectors(uid())}
    out = []
    for meta in _conn.catalog():
        row = rows.get(meta['provider'], {})
        out.append({
            **meta,
            'status': row.get('status') or _conn.STATUS_DISCONNECTED,
            'last_sync_at': row.get('last_sync_at'),
            'last_error': row.get('last_error'),
            'external_user_id': row.get('external_user_id'),
            'scopes': row.get('scopes'),
        })
    return jsonify({"ok": True, "connectors": out})


@app.route("/api/connectors/<provider>", methods=["GET"])
@login_required
def api_connectors_detail(provider: str):
    """Single-provider detail — never exposes tokens."""
    import connectors as _conn
    from api_errors import err, CONNECTOR_NOT_FOUND
    meta = _conn.get_meta(provider)
    if not meta:
        return err(CONNECTOR_NOT_FOUND, f"Unknown provider: {provider}", 404)
    row = _conn.get_connector(uid(), provider) or {}
    return jsonify({"ok": True, "connector": _conn.serialize_for_client(row, meta)})


@app.route("/api/connectors/<provider>/disconnect", methods=["POST"])
@login_required
def api_connectors_disconnect(provider: str):
    """Drop tokens + flip status to revoked. Provider-specific revoke
    calls (e.g. Google token revocation) happen in Phase C1 when the
    per-provider module lives."""
    import connectors as _conn
    from api_errors import err, CONNECTOR_NOT_FOUND
    meta = _conn.get_meta(provider)
    if not meta:
        return err(CONNECTOR_NOT_FOUND, f"Unknown provider: {provider}", 404)
    _conn.save_connector(
        uid(), provider,
        access_token=None, refresh_token=None, expires_at=None, scopes=None,
        status=_conn.STATUS_REVOKED,
        last_error=None, last_error_detail=None,
    )
    return jsonify({"ok": True})


@app.route("/api/connectors/<provider>/mark-connected", methods=["POST"])
@login_required
def api_connectors_mark_connected(provider: str):
    """Device-native providers (HealthKit / Health Connect) use this to
    record their connection state after the native permission flow
    succeeds. OAuth providers never hit this route — they set
    connected via their /callback handlers instead."""
    import connectors as _conn
    from api_errors import err, CONNECTOR_NOT_FOUND, VALIDATION_FAILED
    meta = _conn.get_meta(provider)
    if not meta:
        return err(CONNECTOR_NOT_FOUND, f"Unknown provider: {provider}", 404)
    if meta.kind != 'device_native':
        return err(
            VALIDATION_FAILED,
            "mark-connected is only for device-native connectors; "
            "OAuth providers set connected via their /callback handler.",
            400,
        )
    _conn.mark_connector_connected(uid(), provider)
    return jsonify({"ok": True})


# ── Health samples (PRD §4.6.15 + §4.4) ─────────────────────────────────
# Mobile HealthKit / Health Connect posts samples here. Accepts a batch;
# dedupes on (user_id, source, source_sample_id); returns counts.

@app.route("/api/health/samples", methods=["POST"])
@login_required
def api_health_samples_ingest():
    import health_samples as _hs
    import connectors as _conn
    from api_errors import err, VALIDATION_FAILED
    data = request.get_json(silent=True) or {}
    source = (data.get("source") or "").strip()
    samples = data.get("samples") or []
    if not source or source not in ("healthkit", "health_connect"):
        return err(VALIDATION_FAILED, "source must be 'healthkit' or 'health_connect'", 400)
    if not isinstance(samples, list):
        return err(VALIDATION_FAILED, "samples must be a list", 400)
    try:
        result = _hs.ingest_samples(uid(), source, samples)
    except ValueError as e:
        return err(VALIDATION_FAILED, str(e), 400)
    # Stamp last_sync on the connector row so the Connections UI shows
    # "just synced". Creates the row if the user didn't connect via
    # Settings first (e.g., onboarding-only connect).
    try:
        _conn.save_connector(
            uid(), source,
            status=_conn.STATUS_CONNECTED,
            last_sync_at=int(time.time()),
            last_error=None,
        )
    except Exception:
        _log.exception("health/samples: connector mark-synced failed (non-fatal)")
    return jsonify({"ok": True, **result})


@app.route("/api/health/samples/latest", methods=["GET"])
@login_required
def api_health_samples_latest():
    """Most-recent sample for a given type. Mobile uses this to surface
    "last weight" or "last sleep" in the Fitness / Time tabs without
    pulling the whole series."""
    import health_samples as _hs
    from api_errors import err, VALIDATION_FAILED
    sample_type = (request.args.get("type") or "").strip()
    if sample_type not in _hs.VALID_SAMPLE_TYPES:
        return err(VALIDATION_FAILED, f"invalid type; must be one of {sorted(_hs.VALID_SAMPLE_TYPES)}", 400)
    row = _hs.latest_sample(uid(), sample_type)
    return jsonify({"ok": True, "sample": row})


# Privacy / AI consent (PRD §4.8.7) — backend is source of truth so the
# chatbot prompt filter can enforce it server-side (vs A3's client-only
# AsyncStorage model).

@app.route("/api/privacy/consent", methods=["GET", "PUT"])
@login_required
def api_privacy_consent():
    import connectors as _conn
    if request.method == "GET":
        return jsonify({"ok": True, "consent": _conn.get_consent_map(uid())})
    data = request.get_json(silent=True) or {}
    source = (data.get("source") or "").strip()
    if not source:
        return jsonify({"ok": False, "error": "source required",
                        "error_code": "validation_failed"}), 400
    allowed = bool(data.get("allowed", True))
    _conn.set_consent(uid(), source, allowed)
    return jsonify({"ok": True})


# Webhook receiver — generic stub (BUILD_PLAN_v2 §2.3). Actual signature
# verification + per-provider dispatch lives in Phase C1; for now this
# logs + dedupes so it's safe to point providers at it early.

@app.route("/api/webhooks/<provider>", methods=["POST"])
def api_webhook_receive(provider: str):
    """Stateless: no login_required. Providers send unauthenticated
    payloads; each provider-specific handler in C1 does its own signature
    verification inside the dispatched branch.

    Responsibilities here in B1:
      - reject unknown providers
      - dedupe by (provider, external_event_id) via webhook_events table
      - store payload (truncated) for audit
      - return 202 Accepted quickly so the provider doesn't retry

    Processing (actually doing anything with the event) is a Phase C1
    concern. For now we record-and-acknowledge.
    """
    import connectors as _conn
    import json as _json
    meta = _conn.get_meta(provider)
    if not meta:
        # Don't leak "this endpoint exists for some providers but not others" —
        # return generic 404. Security: also rate-limited by limiter below.
        return jsonify({"ok": False, "error": "not found",
                        "error_code": "not_found"}), 404

    raw = request.get_data(cache=True, as_text=True) or ''
    # Most providers put their event id in a top-level field; we accept a
    # few common shapes. Missing id → we synthesize one from payload hash
    # so dedupe still works (defensive — dedupe is the most important
    # guarantee here).
    event_id = None
    try:
        body = _json.loads(raw) if raw else {}
        event_id = str(body.get('event_id') or body.get('id') or body.get('webhook_code') or '')
    except Exception:
        event_id = None
    if not event_id:
        import hashlib
        event_id = 'synthetic:' + hashlib.sha256(raw.encode('utf-8', errors='ignore')).hexdigest()[:32]

    import time as _time_mod
    now = int(_time_mod.time())
    with get_conn() as conn:
        existing = conn.execute(
            "SELECT id FROM webhook_events WHERE provider = ? AND external_event_id = ?",
            (provider, event_id),
        ).fetchone()
        if existing:
            # Already received; acknowledge without re-processing.
            return jsonify({"ok": True, "deduped": True}), 202
        # Truncate payload for audit — full payload won't fit in logs
        truncated = raw[:8000] if raw else None
        conn.execute("""
            INSERT INTO webhook_events (provider, external_event_id, received_at, status, payload_json)
            VALUES (?, ?, ?, 'pending', ?)
        """, (provider, event_id, now, truncated))
        conn.commit()

    _log.info("webhook received: provider=%s event_id=%s bytes=%d",
              provider, event_id, len(raw or ''))
    # No processing yet — Phase C1 per-provider handlers will dispatch.
    return jsonify({"ok": True}), 202


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
            SELECT id, user_id, log_date, logged_at, description, calories_burned,
                   session_type, strava_activity_id
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
    """Trim internal-only fields and pass pace/progress through cleanly.

    Parses `config_json` into a `config` dict so the client doesn't have
    to. Drops the raw `config_json` string from the payload."""
    if not goal:
        return goal
    out = dict(goal)
    raw_config = out.pop("config_json", None)
    if raw_config:
        try:
            import json as _json
            out["config"] = _json.loads(raw_config)
        except Exception:
            out["config"] = {}
    else:
        out["config"] = {}
    return out


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
            config=data.get("config") if isinstance(data.get("config"), dict) else None,
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

    Called whenever a FIT-01 is created / edited / archived / completed.
    Pulls body stats from user_onboarding.raw_inputs (or profile_map as
    fallback) + the primary goal's target_value, then runs compute_targets
    and upserts user_goals — same code path as /api/goal/update and
    /api/onboarding/complete so calorie math is deterministic across
    entry points.

    No primary fitness goal → driver row left as-is (don't nuke mid-day).
    Missing body stats → driver row left as-is with a log warning; the
    user can fix it by re-entering body stats in Settings → Profile.
    """
    primary = get_primary_fitness_goal(user_id)
    if not primary:
        _log.info(
            "goals: primary fitness goal cleared for user=%s; calorie driver "
            "row left intact (no auto-maintenance fallback in v1).",
            user_id,
        )
        return
    existing = get_user_goal(user_id)
    if not existing:
        # No legacy calorie driver row yet — unusual (onboarding always
        # creates one), but don't crash if it's missing.
        _log.warning("sync calorie driver: user_goals row missing for user=%s", user_id)
        return

    # Pull body stats — raw_inputs is the source of truth; profile_map is
    # a fallback in case raw_inputs has gaps.
    raw = {}
    profile_map = {}
    ob = get_onboarding(user_id)
    if ob:
        try:
            raw = json.loads(ob.get("raw_inputs") or "{}")
        except Exception:
            raw = {}
        try:
            profile_map = json.loads(ob.get("profile_map") or "{}")
        except Exception:
            profile_map = {}

    def _pick(key):
        return raw.get(key) if raw.get(key) not in (None, "") else profile_map.get(key)

    try:
        cur_wt = float(_pick("current_weight_lbs") or 0)
        h_ft = int(_pick("height_ft") or 0)
        h_in = int(_pick("height_in") or 0)
        age = int(_pick("age") or 0)
        sex = _pick("gender") or _pick("sex") or "male"
        bf_pct = float(_pick("body_fat_pct") or 0)
    except (TypeError, ValueError):
        _log.warning(
            "sync calorie driver: body stats unparseable for user=%s; driver row left intact",
            user_id,
        )
        return
    if not (cur_wt > 0 and h_ft > 0 and age > 0):
        _log.info(
            "sync calorie driver: incomplete body stats for user=%s "
            "(weight=%s height_ft=%s age=%s); driver row left intact",
            user_id, cur_wt, h_ft, age,
        )
        return

    tgt_raw = primary.get("target_value")
    tgt_wt = float(tgt_raw) if tgt_raw not in (None, "") else cur_wt

    try:
        targets = compute_targets(
            goal_key=existing["goal_key"],
            weight_lbs=cur_wt,
            target_weight_lbs=tgt_wt,
            height_ft=h_ft, height_in=h_in,
            age=age, sex=sex, bf_pct=bf_pct,
        )
    except Exception:
        _log.exception("sync calorie driver: compute_targets failed for user=%s", user_id)
        return

    # Preserve existing sources_json + mark provenance so the chatbot and
    # debug tooling can trace why targets changed.
    import json as _json
    cfg = {}
    try:
        cfg = _json.loads(targets.get("rationale") or "{}") if isinstance(targets.get("rationale"), str) else (targets.get("rationale") or {})
    except Exception:
        cfg = {}
    cfg["primary_fitness_goal_id"] = primary["goal_id"]
    cfg["primary_fitness_goal_target_value"] = tgt_wt
    cfg["recomputed_from"] = "primary_fitness_goal"

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
        config_json=_json.dumps(cfg),
        sources_json=_json.dumps(targets.get("sources") or []),
    )
    _log.info(
        "goals: calorie driver recomputed for user=%s (target_wt=%s -> cal=%s protein=%s)",
        user_id, tgt_wt, targets["calorie_target"], targets["protein_g"],
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
