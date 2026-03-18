from dotenv import load_dotenv
load_dotenv()

from flask import Flask, render_template, request, jsonify, redirect, url_for
from db import (
    init_db,
    insert_meal, get_today_meals, get_today_totals, delete_meal,
    insert_workout, get_today_workouts, delete_workout, get_today_workout_burn,
    get_meal_history, get_workout_history, get_day_detail,
)
from claude_nutrition import estimate_nutrition, estimate_burn, parse_workout_plan, shorten_label

app = Flask(__name__)

RMR = 1550


def compute_tdee():
    return RMR + get_today_workout_burn()


def render_index(**kwargs):
    meals    = get_today_meals()
    totals   = get_today_totals()
    workouts = get_today_workouts()
    tdee     = compute_tdee()
    return render_template("index.html",
        meals=meals, totals=totals, workouts=workouts, tdee=tdee, **kwargs)


@app.route("/")
def index():
    return render_index()


# ── Meals ──────────────────────────────────────────────

@app.route("/log", methods=["POST"])
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
        insert_meal(description=description, **nutrition)
    except Exception as e:
        return render_index(error=str(e))

    return redirect(url_for("index"))


@app.route("/delete/<int:meal_id>", methods=["POST"])
def delete(meal_id):
    delete_meal(meal_id)
    return redirect(url_for("index"))


@app.route("/api/estimate", methods=["POST"])
def api_estimate():
    data = request.get_json()
    description = (data or {}).get("description", "").strip()
    if not description:
        return jsonify({"error": "No description provided"}), 400
    try:
        return jsonify(estimate_nutrition(description))
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── Workouts ───────────────────────────────────────────

@app.route("/log-workout", methods=["POST"])
def log_workout():
    description = request.form.get("description", "").strip()
    if not description:
        return redirect(url_for("index"))
    calories_burned = int(request.form.get("calories_burned", 0) or 0)
    insert_workout(description, calories_burned)
    return redirect(url_for("index") + "#tab-workout")


@app.route("/delete-workout/<int:workout_id>", methods=["POST"])
def delete_workout_entry(workout_id):
    delete_workout(workout_id)
    return redirect(url_for("index") + "#tab-workout")


@app.route("/api/burn-estimate", methods=["POST"])
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
def api_log_workout():
    data = request.get_json() or {}
    description     = data.get("description", "").strip()
    calories_burned = int(data.get("calories_burned", 0) or 0)
    if not description:
        return jsonify({"error": "No description"}), 400
    insert_workout(description, calories_burned)
    return jsonify({"ok": True})


@app.route("/api/shorten", methods=["POST"])
def api_shorten():
    data = request.get_json()
    description = (data or {}).get("description", "").strip()
    if not description:
        return jsonify({"label": description})
    try:
        return jsonify({"label": shorten_label(description)})
    except Exception:
        return jsonify({"label": description})  # silently fall back to original


@app.route("/api/day/<date_str>")
def api_day(date_str):
    return jsonify(get_day_detail(date_str))


@app.route("/api/history")
def api_history():
    return jsonify({
        "meals":    get_meal_history(90),
        "workouts": get_workout_history(90),
    })


@app.route("/api/parse-workout-plan", methods=["POST"])
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
    init_db()
    app.run(debug=True)
