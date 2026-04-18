from dotenv import load_dotenv
load_dotenv()

import os
import threading
from datetime import date, timedelta
from functools import wraps
from flask import Flask, render_template, request, jsonify, redirect, url_for, session, send_from_directory, make_response
from db import (
    init_db, create_user, verify_user, delete_account,
    insert_meal, get_today_meals, get_today_totals, update_meal, delete_meal,
    insert_workout, get_today_workouts, update_workout, delete_workout, get_today_workout_burn,
    get_meal_history, get_workout_history, get_day_detail,
    get_onboarding, upsert_onboarding_inputs, complete_onboarding,
    get_profile_map, is_onboarding_complete,
    insert_mind_task, get_mind_tasks, toggle_mind_task, delete_mind_task,
    save_daily_weight, get_daily_weight,
    compute_momentum, get_momentum_history,
    save_gmail_tokens, get_gmail_tokens, delete_gmail_tokens, update_gmail_access_token,
    upsert_gmail_cache, get_gmail_cache, clear_gmail_cache,
    save_gmail_summary, get_gmail_summary,
    upsert_user_goal, get_user_goal,
    get_momentum_history_with_deltas, save_momentum_summary, get_momentum_summary,
    get_insight_bundle,
    save_meal, get_saved_meals, delete_saved_meal,
    save_workout, get_saved_workouts, delete_saved_workout,
)
from claude_nutrition import estimate_nutrition, estimate_burn, parse_workout_plan, generate_workout_plan, generate_comprehensive_plan, generate_plan_understanding, revise_plan, shorten_label, scan_meal_image, generate_momentum_insight, generate_scale_summary, suggest_meal, identify_ingredients
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

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if "user_id" not in session:
            return redirect(url_for("login_page"))
        return f(*args, **kwargs)
    return decorated


def uid():
    return session["user_id"]


def client_today():
    """Return today's date string in the client's local timezone.

    The client sets a ``client_date`` cookie (YYYY-MM-DD) on every page load
    and refreshes it each minute.  When the cookie is present and valid we use
    it so that inserts and queries are always anchored to the user's local
    calendar day, not the server's UTC date.
    """
    d = request.cookies.get("client_date", "").strip()
    if d:
        try:
            date.fromisoformat(d)   # validate format
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
    if "user_id" in session:
        return redirect(url_for("index"))
    error = None
    if request.method == "POST":
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
                    return redirect(url_for("index"))
        else:  # login
            user_id = verify_user(username, password)
            if user_id is None:
                error = "Incorrect username or password."
            else:
                session.permanent = True
                session["user_id"]  = user_id
                session["username"] = username.lower()
                return redirect(url_for("index"))
    return render_template("login.html", error=error)


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


@app.route("/logout")
def logout():
    session.clear()
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


@app.route("/api/log-weight", methods=["POST"])
@login_required
def api_log_weight():
    """Save daily weight and update the user's profile current_weight."""
    data = request.get_json() or {}
    weight = data.get("weight_lbs")
    date_str = data.get("date") or client_today()
    if not weight or float(weight) < 30:
        return jsonify({"error": "Invalid weight"}), 400
    weight = float(weight)
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
@login_required
def index():
    if not is_onboarding_complete(uid()):
        return redirect(url_for("onboarding"))
    return render_index()


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


@app.route("/api/onboarding/save", methods=["POST"])
@login_required
def api_onboarding_save():
    """Save raw page inputs progressively (called after each page)."""
    data = request.get_json() or {}
    row = get_onboarding(uid())
    existing = {}
    if row and row.get("raw_inputs"):
        try:
            existing = json.loads(row["raw_inputs"])
        except Exception as e:
            _log.warning("Failed to parse existing onboarding inputs: %s", e)
    # Only overwrite with non-null values so earlier pages aren't wiped
    existing.update({k: v for k, v in data.items() if v is not None})
    upsert_onboarding_inputs(uid(), json.dumps(existing))
    return jsonify({"ok": True})


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
    data = request.get_json() or {}
    image_b64  = data.get("image_b64", "")
    media_type = data.get("media_type", "image/jpeg")
    context    = data.get("context", "").strip()
    if not image_b64:
        return jsonify({"error": "No image provided"}), 400
    try:
        return jsonify(scan_meal_image(image_b64, media_type, context=context))
    except Exception as e:
        _log.exception("scan-meal failed")
        return jsonify({"error": _AI_ERR}), 500


@app.route("/api/meals/scan", methods=["POST"])
@login_required
def api_meals_scan():
    data   = request.get_json() or {}
    images = data.get("images", [])
    if not images:
        return jsonify({"error": "No images provided"}), 400
    try:
        ingredients = identify_ingredients(images)
        return jsonify({"ingredients": ingredients})
    except Exception as e:
        _log.exception("meals/scan failed")
        return jsonify({"error": _AI_ERR}), 500


@app.route("/api/meals/suggest", methods=["POST"])
@login_required
def api_meals_suggest():
    data        = request.get_json() or {}
    ingredients = data.get("ingredients", "").strip()
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
    insert_workout(uid(), description, calories_burned, log_date=cd, logged_at=ct)
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
    """Redirect user to Google OAuth consent screen."""
    if not gmail_sync.is_configured():
        return jsonify({"error": "Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET."}), 400
    import secrets
    oauth_state = secrets.token_urlsafe(32)
    session["gmail_oauth_state"] = oauth_state
    redirect_uri = _gmail_redirect_uri()
    auth_url = gmail_sync.get_auth_url(redirect_uri, state=oauth_state)
    return redirect(auth_url)


@app.route("/api/gmail/callback")
@login_required
def api_gmail_callback():
    """Handle OAuth callback from Google."""
    error = request.args.get("error")
    if error:
        from urllib.parse import urlencode
        return redirect(url_for("index") + "?" + urlencode({"gmail_error": error}))

    returned_state = request.args.get("state", "")
    expected_state = session.pop("gmail_oauth_state", None)
    if not expected_state or returned_state != expected_state:
        return redirect(url_for("index") + "?gmail_error=invalid_state")

    code = request.args.get("code", "")
    if not code:
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
        return redirect(url_for("index") + "?gmail_connected=1#tab-mind")
    except Exception as e:
        _log.exception("Gmail OAuth callback failed")
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


@app.route("/api/goal/update", methods=["POST"])
@login_required
def api_goal_update():
    """Persist goal targets — uses the user's exact slider values."""
    data = request.get_json() or {}
    goal_key = data.get("goal", "lose_weight")
    try:
        rmr = int(data.get("rmr") or data.get("tdee") or 0)
        deficit = int(data.get("deficit", 0))
        protein = int(data.get("protein", 150))
        carbs = int(data.get("carbs", 200))
        fat = int(data.get("fat", 65))
        # Calorie target = TDEE + deficit (deficit is negative for cut)
        tdee_val = rmr  # RMR is the closest we have to TDEE from client
        cal_target = max(tdee_val + deficit, rmr) if tdee_val > 0 else 2000

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


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
