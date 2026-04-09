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
    upsert_garmin_daily, get_garmin_daily, get_garmin_last_sync,
    garmin_activity_exists, insert_garmin_workout,
    get_setting, set_setting,
    get_onboarding, upsert_onboarding_inputs, complete_onboarding,
    get_profile_map, is_onboarding_complete,
    insert_mind_checkin, get_mind_today, get_mind_history, get_garmin_history,
    insert_mind_task, get_mind_tasks, toggle_mind_task, delete_mind_task,
    save_daily_weight, get_daily_weight,
    upsert_sleep, get_sleep, get_sleep_history,
    compute_momentum, get_momentum_history,
    save_gmail_tokens, get_gmail_tokens, delete_gmail_tokens, update_gmail_access_token,
    upsert_gmail_cache, get_gmail_cache, clear_gmail_cache,
    save_gmail_summary, get_gmail_summary,
    upsert_user_goal, get_user_goal,
)
from claude_nutrition import estimate_nutrition, estimate_burn, parse_workout_plan, shorten_label, scan_meal_image, generate_momentum_insight, suggest_meal, identify_ingredients
from claude_profile import generate_profile_map, compute_mind_insights, score_brief
import garmin_sync
import gmail_sync
from goal_config import compute_targets, get_goal_config
import json
import logging as _log

_AI_ERR = "Something went wrong, please try again later"

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "life-dashboard-default-secret-v1")
app.permanent_session_lifetime = timedelta(days=90)
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
    except Exception:
        return str(ts or "")[11:16]

# In-memory store for async onboarding jobs: {user_id: {"status": "pending"|"done"|"error", "profile": {...}, "error": "..."}}
_ob_jobs: dict = {}

def get_rmr() -> int:
    """Return the user's RMR from their profile map, falling back to 1550."""
    profile = get_profile_map(uid())
    return int(profile.get("rmr_kcal") or 1550)


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
    return render_template("index.html",
        meals=meals, totals=totals, workouts=workouts, tdee=tdee,
        workout_burn=workout_burn, server_rmr=server_rmr,
        user_id=uid(), username=session.get("username", ""),
        **kwargs)


# ── Auth routes ─────────────────────────────────────────

@app.route("/login", methods=["GET", "POST"])
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


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login_page"))


@app.route("/api/delete-account", methods=["POST"])
@login_required
def api_delete_account():
    delete_account(uid())
    session.clear()
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
        except Exception:
            pass
    return render_template("onboarding.html",
                           username=session.get("username", ""),
                           saved=raw)


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
        except Exception:
            pass
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
    resp = {
        "energy_level_typical_1_10":  p.get("energy_level_typical_1_10"),
        "mood_baseline_1_10":         p.get("mood_baseline_1_10"),
        "stress_level_1_10":          p.get("stress_level_1_10"),
        "daily_calorie_goal":         p.get("daily_calorie_goal"),
        "daily_protein_goal_g":       p.get("daily_protein_goal_g"),
        "rmr_kcal":                   p.get("rmr_kcal"),
        "primary_goal":               p.get("primary_goal"),
        "steps_per_day_estimated":    p.get("steps_per_day_estimated"),
        "behavioral_archetype":       p.get("behavioral_archetype"),
        "first_name":                 p.get("first_name"),
        "one_sentence_summary":       p.get("one_sentence_summary"),
        "biggest_leverage_point":     p.get("biggest_leverage_point"),
    }
    # Include computed goal targets if available
    if goal:
        resp["goal_targets"] = {
            "goal_key":        goal["goal_key"],
            "calorie_target":  goal["calorie_target"],
            "protein_g":       goal["protein_g"],
            "fat_g":           goal["fat_g"],
            "carbs_g":         goal["carbs_g"],
            "deficit_surplus":  goal["deficit_surplus"],
            "rmr":             goal["rmr"],
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
            targets = compute_targets(
                goal_key=goal_key,
                weight_lbs=float(raw.get("current_weight_lbs") or profile.get("current_weight_lbs") or 185),
                target_weight_lbs=float(raw.get("target_weight_lbs") or profile.get("target_weight_lbs") or 170),
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

        _ob_jobs[user_id] = {"status": "done", "profile": profile, "targets": targets}
    except Exception as e:
        tb = traceback.format_exc()
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
    _ob_jobs[user] = {"status": "pending"}
    t = threading.Thread(target=_run_profile_generation, args=(user, raw), daemon=True)
    t.start()
    return jsonify({"queued": True})


@app.route("/api/onboarding/poll")
@login_required
def api_onboarding_poll():
    """Poll for async profile generation status."""
    user = uid()
    job = _ob_jobs.get(user)
    if job is None:
        return jsonify({"status": "not_started"})
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
    checkins = get_mind_today(uid(), today)
    total    = len(tasks)
    done     = sum(1 for t in tasks if t["completed"])
    resp = jsonify({
        "date":       today,
        "tasks":      tasks,
        "checkins":   checkins,
        "history":    get_mind_history(uid(), days=14),
        "completion": round(done / total * 100) if total else 0,
        "total":      total,
        "done":       done,
    })
    resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    return resp


@app.route("/api/mind/checkin", methods=["POST"])
@login_required
def api_mind_checkin():
    try:
        data         = request.get_json(force=True) or {}
        checkin_type = data.get("type", "morning")
        goals        = data.get("goals", "").strip()
        notes        = data.get("notes", "").strip()
        if not notes:
            return jsonify({"error": "notes required"}), 400

        # Persist bodyweight logged during morning brief
        bodyweight_lbs = data.get("bodyweight_lbs")
        today = date.today().isoformat()
        if checkin_type == "morning" and bodyweight_lbs:
            try:
                save_daily_weight(uid(), today, float(bodyweight_lbs))
            except (ValueError, TypeError):
                pass

        def _clamp(v):
            try:
                return max(1, min(10, int(v))) if v is not None else None
            except (ValueError, TypeError):
                return None

        energy_level  = _clamp(data.get("energy_level"))
        stress_level  = _clamp(data.get("stress_level"))
        sleep_quality = _clamp(data.get("sleep_quality"))
        mood_level    = _clamp(data.get("mood_level"))
        focus_level   = _clamp(data.get("focus_level"))

        today_str = client_today()
        scores = score_brief(checkin_type, notes, goals)
        insert_mind_checkin(uid(), checkin_type, goals, notes,
                            scores["focus"], scores["wellbeing"], scores["summary"],
                            energy_level=energy_level, stress_level=stress_level,
                            checkin_date=today_str,
                            sleep_quality=sleep_quality, mood_level=mood_level,
                            focus_level=focus_level)
        # Evening tasks are for tomorrow; morning tasks are for today
        from datetime import date as _date, timedelta as _td
        task_date_str = ((_date.fromisoformat(today_str) + _td(days=1)).isoformat()
                         if checkin_type == "evening" else today_str)
        tasks_added = []
        for task_text in scores.get("tasks", []):
            if task_text:
                tid = insert_mind_task(uid(), task_text, source=checkin_type + "_brief",
                                       task_date=task_date_str)
                tasks_added.append({"id": tid, "description": task_text})
        return jsonify({**scores, "tasks_added": tasks_added,
                        "bodyweight_lbs": float(bodyweight_lbs) if bodyweight_lbs else None})
    except Exception as e:
        _log.exception("mind/checkin failed")
        return jsonify({"error": _AI_ERR}), 500


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

@app.route("/log", methods=["POST"])
@login_required
def log_meal():
    description = request.form.get("description", "").strip()
    if not description:
        return redirect(url_for("index"))

    cal_raw = request.form.get("calories", "").strip()
    try:
        if cal_raw:
            nutrition = {
                "calories":  int(request.form.get("calories", 0)),
                "protein_g": float(request.form.get("protein_g", 0)),
                "carbs_g":   float(request.form.get("carbs_g", 0)),
                "fat_g":     float(request.form.get("fat_g", 0)),
            }
        else:
            nutrition = estimate_nutrition(description)
        insert_meal(uid(), description=description, log_date=client_today(), **nutrition)
    except Exception as e:
        return render_index(error=str(e))

    return redirect(url_for("index"))


@app.route("/delete/<int:meal_id>", methods=["POST"])
@login_required
def delete(meal_id):
    delete_meal(meal_id, uid())
    return redirect(url_for("index"))


@app.route("/api/today-nutrition")
@login_required
def api_today_nutrition():
    cd = client_today()
    return jsonify({"meals": get_today_meals(uid(), cd), "totals": get_today_totals(uid(), cd)})


@app.route("/api/log-meal", methods=["POST"])
@login_required
def api_log_meal():
    data = request.get_json() or {}
    description = data.get("description", "").strip()
    if not description:
        return jsonify({"error": "No description"}), 400
    try:
        nutrition = {
            "calories":  int(data.get("calories", 0)),
            "protein_g": float(data.get("protein_g", 0)),
            "carbs_g":   float(data.get("carbs_g", 0)),
            "fat_g":     float(data.get("fat_g", 0)),
        }
        cd = data.get("client_date") or client_today()
        ct = data.get("client_time") or None
        insert_meal(uid(), description=description, log_date=cd, logged_at=ct, **nutrition)
        return jsonify({"meals": get_today_meals(uid(), cd), "totals": get_today_totals(uid(), cd)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


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
    )
    cd = client_today()
    return jsonify({"meals": get_today_meals(uid(), cd), "totals": get_today_totals(uid(), cd)})


@app.route("/api/delete-meal/<int:meal_id>", methods=["POST"])
@login_required
def api_delete_meal(meal_id):
    cd = client_today()
    delete_meal(meal_id, uid())
    return jsonify({"meals": get_today_meals(uid(), cd), "totals": get_today_totals(uid(), cd)})


@app.route("/api/delete-workout/<int:workout_id>", methods=["POST"])
@login_required
def api_delete_workout(workout_id):
    cd = client_today()
    delete_workout(workout_id, uid())
    workouts = get_today_workouts(uid(), cd)
    burn = get_today_workout_burn(uid(), cd)
    return jsonify({"workouts": workouts, "burn": burn})


@app.route("/api/today-workouts")
@login_required
def api_today_workouts():
    cd = client_today()
    workouts = get_today_workouts(uid(), cd)
    burn = get_today_workout_burn(uid(), cd)
    return jsonify({"workouts": workouts, "burn": burn})


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

    profile = get_profile_map(uid())

    # Calculate remaining calories using client TDEE (includes NEAT+exercise+TEF)
    client_tdee = data.get("tdee")
    if client_tdee:
        tdee = int(client_tdee)
    else:
        tdee = int(profile.get("rmr_kcal") or 1550)
    deficit = int(profile.get("calorie_deficit_target") or 0)
    # Use client-provided consumed; fall back to DB
    if not cal_consumed:
        totals = get_today_totals(uid(), client_today())
        cal_consumed = int((totals or {}).get("calories", 0) or 0)
    cal_target      = tdee - deficit
    cal_remaining   = max(0, cal_target - cal_consumed)

    # Macro remaining
    macro_remaining = None
    pro_goal = data.get("protein_goal")
    if pro_goal is not None:
        macro_remaining = {
            "protein_remaining_g": max(0, float(pro_goal) - float(data.get("protein_consumed", 0) or 0)),
            "carbs_remaining_g":   max(0, float(data.get("carbs_goal", 250)) - float(data.get("carbs_consumed", 0) or 0)),
            "fat_remaining_g":     max(0, float(data.get("fat_goal", 75)) - float(data.get("fat_consumed", 0) or 0)),
        }

    try:
        result = suggest_meal(
            ingredients=ingredients,
            images=images[:6],
            profile_map=profile,
            calories_remaining=cal_remaining,
            meal_type=meal_type,
            macro_remaining=macro_remaining,
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
    try:
        return jsonify(estimate_nutrition(description, profile_map=get_profile_map(uid())))
    except Exception as e:
        _log.exception("estimate failed")
        return jsonify({"error": _AI_ERR}), 500


# ── Workouts ────────────────────────────────────────────

@app.route("/log-workout", methods=["POST"])
@login_required
def log_workout():
    description = request.form.get("description", "").strip()
    if not description:
        return redirect(url_for("index"))
    calories_burned = int(request.form.get("calories_burned", 0) or 0)
    insert_workout(uid(), description, calories_burned, log_date=client_today())
    return redirect(url_for("index") + "#tab-workout")


@app.route("/delete-workout/<int:workout_id>", methods=["POST"])
@login_required
def delete_workout_entry(workout_id):
    delete_workout(workout_id, uid())
    return redirect(url_for("index") + "#tab-workout")


@app.route("/api/burn-estimate", methods=["POST"])
@login_required
def api_burn_estimate():
    data = request.get_json()
    description = (data or {}).get("description", "").strip()
    if not description:
        return jsonify({"error": "No description provided"}), 400
    try:
        return jsonify(estimate_burn(description, profile_map=get_profile_map(uid())))
    except Exception as e:
        _log.exception("burn-estimate failed")
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
    except Exception:
        return jsonify({"label": description})


@app.route("/api/day/<date_str>")
@login_required
def api_day(date_str):
    detail = get_day_detail(uid(), date_str)
    detail["sleep"]  = get_sleep(uid(), date_str)
    detail["garmin"] = get_garmin_daily(uid(), date_str)
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


@app.route("/api/history")
@login_required
def api_history():
    # Build briefs map: {date: ["morning", "evening", ...]}
    briefs_raw = get_mind_history(uid(), 90)
    briefs: dict = {}
    for row in briefs_raw:
        d = row["checkin_date"]
        briefs.setdefault(d, []).append(row["type"])
    momentum_rows = get_momentum_history(uid(), 90)
    momentum = {r["score_date"]: r["momentum_score"] for r in momentum_rows}
    return jsonify({
        "meals":    get_meal_history(uid(), 90),
        "workouts": get_workout_history(uid(), 90),
        "briefs":   briefs,
        "sleep":    get_sleep_history(uid(), 90),
        "momentum": momentum,
        "garmin":   get_garmin_history(uid(), 90),
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


# ── Garmin ──────────────────────────────────────────────

def _garmin_save(user_id: int, date_str: str, result: dict) -> None:
    """Callback used by the background poll thread to persist fetched data."""
    upsert_garmin_daily(
        user_id, date_str,
        result["steps"],
        result["active_calories"],
        result["total_calories"],
        result["resting_hr"],
    )
    sleep = result.get("sleep")
    if sleep:
        upsert_sleep(user_id, date_str,
                     sleep["total_seconds"], sleep["deep_seconds"],
                     sleep["light_seconds"], sleep["rem_seconds"],
                     sleep["awake_seconds"], sleep.get("sleep_score"))
    for act in result.get("activities", []):
        gid = act.get("garmin_activity_id", "")
        if gid and garmin_activity_exists(user_id, gid):
            continue
        # Use the activity's own local start time so logged_at reflects when
        # the activity happened, not when the sync ran
        logged_at = act.get("start_time_local") or None
        insert_garmin_workout(user_id, date_str, act["description"], act["calories"], gid,
                              logged_at=logged_at)


# Start background poll on app startup (user_id=1 for this personal app)
garmin_sync.start_background_poll(_garmin_save, user_id=1)


@app.route("/api/garmin")
@login_required
def api_garmin():
    today    = client_today()
    day_data = get_garmin_daily(uid(), today)
    last_sync = get_garmin_last_sync(uid())
    return jsonify({
        "configured": garmin_sync.is_configured(),
        "today":      day_data,
        "last_sync":  last_sync,
    })


@app.route("/api/garmin/status")
@login_required
def api_garmin_status():
    configured = garmin_sync.is_configured()
    today      = client_today()
    day_data   = get_garmin_daily(uid(), today) if configured else None
    last_sync  = get_garmin_last_sync(uid()) if configured else None
    sleep      = get_sleep(uid(), today) if configured else None
    return jsonify({
        "configured": configured,
        "last_sync":  last_sync,
        "today":      day_data,
        "sleep":      sleep,
    })


@app.route("/api/garmin/sync", methods=["POST"])
@login_required
def api_garmin_sync():
    if not garmin_sync.is_configured():
        return jsonify({"error": "GARMIN_EMAIL and GARMIN_PASSWORD are not set in environment variables."}), 400

    import time as _time
    data      = request.get_json() or {}
    sync_date = data.get("date") or client_today()
    force     = data.get("force", False)

    # Throttle manual syncs: skip if fetched within the last 5 minutes (unless forced)
    elapsed = _time.time() - garmin_sync._last_fetch_time
    if not force and elapsed < 300:
        return jsonify({"skipped": True, "reason": f"synced {int(elapsed)}s ago — wait a moment"}), 200

    try:
        result = garmin_sync.fetch_day(sync_date)
        garmin_sync._last_fetch_time = _time.time()
    except Exception as e:
        return jsonify({"error": str(e)}), 502

    # Persist daily stats
    upsert_garmin_daily(
        uid(), sync_date,
        result["steps"],
        result["active_calories"],
        result["total_calories"],
        result["resting_hr"],
    )

    # Save sleep if present
    sleep = result.get("sleep")
    if sleep:
        upsert_sleep(uid(), sync_date,
                     sleep["total_seconds"], sleep["deep_seconds"],
                     sleep["light_seconds"], sleep["rem_seconds"],
                     sleep["awake_seconds"], sleep.get("sleep_score"))

    # Import activities as workout_log entries (skip duplicates)
    imported = []
    for act in result["activities"]:
        gid = act["garmin_activity_id"] if "garmin_activity_id" in act else act.get("garmin_id", "")
        if gid and garmin_activity_exists(uid(), gid):
            continue
        insert_garmin_workout(
            uid(), sync_date,
            act["description"],
            act["calories"],
            gid,
        )
        imported.append(act["description"])

    return jsonify({
        "date":            sync_date,
        "steps":           result["steps"],
        "active_calories": result["active_calories"],
        "total_calories":  result["total_calories"],
        "resting_hr":      result["resting_hr"],
        "sleep":           get_sleep(uid(), sync_date),
        "activities_imported": len(imported),
        "activities":      imported,
        "workouts":        get_today_workouts(uid(), sync_date),
        "burn":            get_today_workout_burn(uid(), sync_date),
    })


# ── Gmail ──────────────────────────────────────────────

@app.route("/api/gmail/status")
@login_required
def api_gmail_status():
    """Return Gmail connection status and cached summary for today."""
    tokens = get_gmail_tokens(uid())
    connected = tokens is not None
    today = client_today()
    summary = get_gmail_summary(uid(), today) if connected else None
    cached = get_gmail_cache(uid(), limit=15) if connected else []
    unreplied = sum(1 for e in cached if not e["has_replied"] and not e["is_read"])
    return jsonify({
        "configured": gmail_sync.is_configured(),
        "connected":  connected,
        "email":      tokens.get("email_address", "") if tokens else "",
        "summary":    summary,
        "emails":     cached,
        "unreplied":  unreplied,
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
    redirect_uri = _gmail_redirect_uri()
    auth_url = gmail_sync.get_auth_url(redirect_uri, state=str(uid()))
    return redirect(auth_url)


@app.route("/api/gmail/callback")
@login_required
def api_gmail_callback():
    """Handle OAuth callback from Google."""
    error = request.args.get("error")
    if error:
        return redirect(url_for("index") + "?gmail_error=" + error)

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

    # Cache emails
    clear_gmail_cache(uid())
    for e in emails:
        upsert_gmail_cache(
            uid(), e["thread_id"], e["message_id"],
            e["sender"], e["subject"], e["snippet"],
            e["received_at"], e["has_replied"], e["is_read"],
        )

    # Generate AI summary
    today = client_today()
    summary_text = gmail_sync.summarize_emails(emails)
    unreplied = sum(1 for e in emails if not e["has_replied"] and not e["is_read"])
    save_gmail_summary(uid(), today, summary_text, len(emails), unreplied)

    return jsonify({
        "emails":     emails,
        "summary":    {"summary_text": summary_text, "email_count": len(emails), "unreplied": unreplied},
        "unreplied":  unreplied,
    })


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
    try:
        breakdown = compute_momentum(uid(), today, calorie_goal_override=calorie_goal)
        return jsonify(breakdown)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


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
        tdee         = int(body.get("tdee") or 0) or None
        cal_consumed = int(body.get("cal_consumed") or 0)
        breakdown    = compute_momentum(uid(), today)
        history      = get_momentum_history(uid(), 14)
        profile      = get_profile_map(uid())
        meals        = get_today_meals(uid(), today)
        workouts     = get_today_workouts(uid(), today)
        garmin       = get_garmin_daily(uid(), today)
        sleep        = get_sleep(uid(), today)
        garmin_hist  = get_garmin_history(uid(), 14)
        sleep_hist   = get_sleep_history(uid(), 14)
        meal_hist    = get_meal_history(uid(), 14)
        workout_hist = get_workout_history(uid(), 14)
        result       = generate_momentum_insight(
            breakdown, history, profile, meals, workouts, garmin, sleep, hour,
            garmin_hist=garmin_hist, sleep_hist=sleep_hist,
            meal_hist=meal_hist, workout_hist=workout_hist,
            tdee=tdee, cal_consumed=cal_consumed,
        )
        return jsonify(result)
    except Exception as e:
        _log.exception("momentum-insight failed")
        return jsonify({"error": _AI_ERR}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
