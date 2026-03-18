from dotenv import load_dotenv
load_dotenv()

from flask import Flask, render_template, request, jsonify, redirect, url_for
from db import init_db, insert_meal, get_today_meals, get_today_totals, delete_meal
from claude_nutrition import estimate_nutrition

app = Flask(__name__)


@app.route("/")
def index():
    meals = get_today_meals()
    totals = get_today_totals()
    return render_template("index.html", meals=meals, totals=totals)


@app.route("/log", methods=["POST"])
def log_meal():
    description = request.form.get("description", "").strip()
    if not description:
        return redirect(url_for("index"))

    try:
        nutrition = estimate_nutrition(description)
        insert_meal(
            description=description,
            calories=nutrition["calories"],
            protein_g=nutrition["protein_g"],
            carbs_g=nutrition["carbs_g"],
            fat_g=nutrition["fat_g"],
        )
    except Exception as e:
        if request.headers.get("X-Requested-With") == "XMLHttpRequest":
            return jsonify({"error": str(e)}), 500
        return render_template("index.html", meals=get_today_meals(), totals=get_today_totals(), error=str(e))

    return redirect(url_for("index"))


@app.route("/delete/<int:meal_id>", methods=["POST"])
def delete(meal_id):
    delete_meal(meal_id)
    return redirect(url_for("index"))


@app.route("/api/estimate", methods=["POST"])
def api_estimate():
    """AJAX endpoint: returns nutrition estimate without saving."""
    data = request.get_json()
    description = (data or {}).get("description", "").strip()
    if not description:
        return jsonify({"error": "No description provided"}), 400
    try:
        nutrition = estimate_nutrition(description)
        return jsonify(nutrition)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    init_db()
    app.run(debug=True)
