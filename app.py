from dotenv import load_dotenv
load_dotenv()

import os
from datetime import date, timedelta
from functools import wraps
from flask import Flask, render_template, request, jsonify, redirect, url_for, session
from db import (
    init_db, create_user, verify_user, delete_account,
    insert_meal, get_today_meals, get_today_totals, update_meal, delete_meal,
    insert_workout, get_today_workouts, delete_workout, get_today_workout_burn,
    get_meal_history, get_workout_history, get_day_detail,
    upsert_garmin_daily, get_garmin_daily, get_garmin_last_sync,
    garmin_activity_exists, insert_garmin_workout,
    get_setting, set_setting,
    get_onboarding, upsert_onboarding_inputs, complete_onboarding,
    get_profile_map, is_onboarding_complete,
)
from claude_nutrition import estimate_nutrition, estimate_burn, parse_workout_plan, shorten_label, scan_meal_image
from claude_profile import generate_profile_map, generate_mind_insights
import garmin_sync
import json

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "life-dashboard-default-secret-v1")
app.permanent_session_lifetime = timedelta(days=90)
init_db()

RMR = 1550


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
    return RMR + get_today_workout_burn(uid(), log_date)


def render_index(**kwargs):
    cd       = client_today()
    meals    = get_today_meals(uid(), cd)
    totals   = get_today_totals(uid(), cd)
    workouts = get_today_workouts(uid(), cd)
    tdee     = compute_tdee(cd)
    return render_template("index.html",
        meals=meals, totals=totals, workouts=workouts, tdee=tdee,
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
    if is_onboarding_complete(uid()):
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
    existing.update(data)
    upsert_onboarding_inputs(uid(), json.dumps(existing))
    return jsonify({"ok": True})


@app.route("/api/onboarding/status")
@login_required
def api_onboarding_status():
    return jsonify({"complete": is_onboarding_complete(uid())})


@app.route("/api/onboarding/complete", methods=["POST"])
@login_required
def api_onboarding_complete():
    """Run Claude Opus to generate the 200-var profile map and mark onboarding done."""
    import traceback
    user = uid()
    step = "init"
    try:
        step = "get_onboarding"
        row = get_onboarding(user)
        if not row:
            return jsonify({"error": "step=get_onboarding: no row found — go back to page 1 and hit Continue once to save your answers, then try again."}), 400

        step = "parse_raw_inputs"
        raw = json.loads(row.get("raw_inputs") or "{}")

        step = "generate_profile_map (Claude API)"
        profile = generate_profile_map(raw)

        step = "complete_onboarding (DB write)"
        complete_onboarding(user, json.dumps(profile))

        step = "verify_complete"
        if not is_onboarding_complete(user):
            return jsonify({"error": "step=verify: DB write did not persist — Railway may be using an ephemeral filesystem. Check that a persistent volume is mounted."}), 500

        return jsonify({"ok": True, "profile": profile})

    except Exception as e:
        tb = traceback.format_exc()
        return jsonify({"error": f"step={step}: {type(e).__name__}: {e}", "traceback": tb[-800:]}), 500


# ── Mind tab ────────────────────────────────────────────

@app.route("/api/mind/insights")
@login_required
def api_mind_insights():
    profile = get_profile_map(uid())
    if not profile:
        return jsonify({"error": "no_profile"}), 404
    try:
        insights = generate_mind_insights(profile)
        return jsonify(insights)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/mind/profile")
@login_required
def api_mind_profile():
    return jsonify(get_profile_map(uid()))


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
        return jsonify({"error": str(e)}), 500


@app.route("/api/estimate", methods=["POST"])
@login_required
def api_estimate():
    data = request.get_json()
    description = (data or {}).get("description", "").strip()
    if not description:
        return jsonify({"error": "No description provided"}), 400
    try:
        return jsonify(estimate_nutrition(description))
    except Exception as e:
        return jsonify({"error": str(e)}), 500


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
        return jsonify(estimate_burn(description))
    except Exception as e:
        return jsonify({"error": str(e)}), 500


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
    return jsonify(get_day_detail(uid(), date_str))


@app.route("/api/history")
@login_required
def api_history():
    return jsonify({
        "meals":    get_meal_history(uid(), 90),
        "workouts": get_workout_history(uid(), 90),
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
        return jsonify({"error": str(e)}), 500


# ── Garmin ──────────────────────────────────────────────

@app.route("/api/garmin/status")
@login_required
def api_garmin_status():
    configured = garmin_sync.is_configured()
    today      = client_today()
    day_data   = get_garmin_daily(uid(), today) if configured else None
    last_sync  = get_garmin_last_sync(uid()) if configured else None
    return jsonify({
        "configured": configured,
        "last_sync":  last_sync,
        "today":      day_data,
    })


@app.route("/api/garmin/sync", methods=["POST"])
@login_required
def api_garmin_sync():
    if not garmin_sync.is_configured():
        return jsonify({"error": "GARMIN_EMAIL and GARMIN_PASSWORD are not set in environment variables."}), 400

    data      = request.get_json() or {}
    sync_date = data.get("date") or client_today()

    try:
        result = garmin_sync.fetch_day(sync_date)
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
        "activities_imported": len(imported),
        "activities":      imported,
        "workouts":        get_today_workouts(uid(), sync_date),
        "burn":            get_today_workout_burn(uid(), sync_date),
    })


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
