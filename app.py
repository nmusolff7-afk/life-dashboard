from dotenv import load_dotenv
load_dotenv()

import os
from datetime import timedelta
from functools import wraps
from flask import Flask, render_template, request, jsonify, redirect, url_for, session
from db import (
    init_db, create_user, verify_user,
    insert_meal, get_today_meals, get_today_totals, delete_meal,
    insert_workout, get_today_workouts, delete_workout, get_today_workout_burn,
    get_meal_history, get_workout_history, get_day_detail,
)
from claude_nutrition import estimate_nutrition, estimate_burn, parse_workout_plan, shorten_label

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


# ── Rendering helper ────────────────────────────────────

def compute_tdee():
    return RMR + get_today_workout_burn(uid())


def render_index(**kwargs):
    meals    = get_today_meals(uid())
    totals   = get_today_totals(uid())
    workouts = get_today_workouts(uid())
    tdee     = compute_tdee()
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


# ── Main app ────────────────────────────────────────────

@app.route("/")
@login_required
def index():
    return render_index()


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
        insert_meal(uid(), description=description, **nutrition)
    except Exception as e:
        return render_index(error=str(e))

    return redirect(url_for("index"))


@app.route("/delete/<int:meal_id>", methods=["POST"])
@login_required
def delete(meal_id):
    delete_meal(meal_id, uid())
    return redirect(url_for("index"))


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
    insert_workout(uid(), description, calories_burned)
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
    insert_workout(uid(), description, calories_burned)
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


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
