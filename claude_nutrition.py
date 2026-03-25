import json
import os
import anthropic

def _client():
    return anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

# ── Nutrition estimation ───────────────────────────────

NUTRITION_PROMPT = """You are a nutrition expert. When given a meal description in plain English,
estimate the nutritional content. Always respond with a valid JSON object and nothing else.
Use your best judgment for portion sizes when not specified.

Respond ONLY with this exact JSON structure (no markdown, no explanation):
{
  "calories": <integer>,
  "protein_g": <number with one decimal>,
  "carbs_g": <number with one decimal>,
  "fat_g": <number with one decimal>,
  "notes": "<brief note about assumptions made, if any>"
}"""


def _parse_json(text: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    return json.loads(text.strip())


def estimate_nutrition(meal_description: str, profile_map: dict | None = None) -> dict:
    user_content = meal_description
    if profile_map:
        fields = {
            "diet_type":               profile_map.get("diet_type"),
            "dietary_restrictions":    profile_map.get("dietary_restrictions"),
            "foods_disliked_list":     profile_map.get("foods_disliked_list"),
            "daily_calorie_goal":      profile_map.get("daily_calorie_goal"),
            "daily_protein_goal_g":    profile_map.get("daily_protein_goal_g"),
        }
        # Only include fields that are actually set
        populated = {k: v for k, v in fields.items() if v is not None}
        if populated:
            context = "\n\nUser profile context (use to calibrate portion and macro estimates):\n"
            context += "\n".join(f"- {k}: {v}" for k, v in populated.items())
            user_content = meal_description + context

    response = _client().messages.create(
        model="claude-opus-4-6",
        max_tokens=512,
        system=NUTRITION_PROMPT,
        messages=[{"role": "user", "content": user_content}],
    )
    text = next(b.text for b in response.content if b.type == "text")
    data = _parse_json(text)
    return {
        "calories":  int(data["calories"]),
        "protein_g": float(data["protein_g"]),
        "carbs_g":   float(data["carbs_g"]),
        "fat_g":     float(data["fat_g"]),
        "notes":     data.get("notes", ""),
    }


# ── Meal image scanning ───────────────────────────────

SCAN_PROMPT = """You are a nutrition expert analyzing a photo of food.
Identify what food or meal is shown and estimate its nutritional content.

Respond ONLY with this exact JSON structure (no markdown, no explanation):
{
  "description": "<2-5 word meal name>",
  "calories": <integer>,
  "protein_g": <number with one decimal>,
  "carbs_g": <number with one decimal>,
  "fat_g": <number with one decimal>,
  "notes": "<brief note about what you see and portion assumptions>"
}

Be realistic about portion sizes based on what is visible in the image."""


def scan_meal_image(image_b64: str, media_type: str, context: str = "") -> dict:
    prompt = SCAN_PROMPT
    if context:
        prompt += f"\n\nAdditional context from the user: {context}"
    response = _client().messages.create(
        model="claude-opus-4-6",
        max_tokens=512,
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": media_type,
                        "data": image_b64,
                    }
                },
                {"type": "text", "text": prompt},
            ]
        }],
    )
    text = next(b.text for b in response.content if b.type == "text")
    data = _parse_json(text)
    return {
        "description": data.get("description", "Meal from photo"),
        "calories":    int(data["calories"]),
        "protein_g":   float(data["protein_g"]),
        "carbs_g":     float(data["carbs_g"]),
        "fat_g":       float(data["fat_g"]),
        "notes":       data.get("notes", ""),
    }


# ── Workout burn estimation ────────────────────────────

BURN_PROMPT = """You are a fitness expert. Given a workout description in plain English,
estimate the total calories burned. Use your best judgment for intensity and duration when not specified.

Respond ONLY with this exact JSON structure (no markdown, no explanation):
{
  "calories_burned": <integer>,
  "notes": "<brief note about assumptions made, if any>"
}"""


def estimate_burn(workout_description: str) -> dict:
    response = _client().messages.create(
        model="claude-opus-4-6",
        max_tokens=300,
        system=BURN_PROMPT,
        messages=[{"role": "user", "content": workout_description}],
    )
    text = next(b.text for b in response.content if b.type == "text")
    data = _parse_json(text)
    return {
        "calories_burned": int(data["calories_burned"]),
        "notes":           data.get("notes", ""),
    }


# ── Label shortening ──────────────────────────────────

SHORTEN_PROMPT = """Generate a short, clean 2-5 word label for a food or activity description.
Return ONLY the label — no quotes, no punctuation at the end, no explanation.

Examples:
"footlong subway club with italian herbs and cheese, pepper jack, lettuce, tomatoes, red onions, pickles, black olives, baja chipotle" → Subway Footlong
"4 mile run at 7:50/mile, 145 bpm heart rate" → 4mi Run
"two scrambled eggs, toast with butter, and a glass of OJ" → Eggs & Toast
"3 sets of pull-ups and bicep curls 3x12 with 35 lb dumbbells" → Pull-ups & Curls
"large chicken caesar salad with croutons and extra parmesan" → Chicken Caesar Salad"""


def shorten_label(description: str) -> str:
    response = _client().messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=32,
        system=SHORTEN_PROMPT,
        messages=[{"role": "user", "content": description}],
    )
    return next(b.text for b in response.content if b.type == "text").strip()


# ── Workout plan parsing ───────────────────────────────

PLAN_PROMPT = """You are a fitness coach. Given a workout schedule in any format, convert it into a structured weekly plan.

Respond ONLY with this exact JSON structure (no markdown, no explanation):
{
  "Monday":    [{"name": "<exercise name>", "sets": <integer>}, ...],
  "Tuesday":   [...],
  "Wednesday": [...],
  "Thursday":  [...],
  "Friday":    [...],
  "Saturday":  [...],
  "Sunday":    [...]
}

Rules:
- Include all 7 days. Use an empty array [] for rest days.
- If sets are not specified, use a sensible default (3-4 sets).
- Exercise names should be clean title-case (e.g. "Bench Press" not "bench press (barbell)").
- If a day has multiple exercises, list them in logical order."""

_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


# ── Momentum pattern insight ──────────────────────────

_MOMENTUM_INSIGHT_SYSTEM = (
    "You are a read-only data analyst. You have access to a user's health and habit tracking data. "
    "Your only job is to cross-check the numbers and report a genuine pattern if one exists. "
    "Rules:\n"
    "- Use the TIME field to anchor your analysis. Morning insights focus on overnight/previous-day patterns. "
    "  Afternoon insights can compare today so far against the trend. Evening insights can assess the full day.\n"
    "- Only report a pattern if it is genuinely visible in the numbers — two or more domains (sleep, movement, "
    "  nutrition, habits, score) that clearly correlate or contrast with each other or the 7-day trend.\n"
    "- If no genuine cross-domain pattern is visible, return exactly: 'No clear pattern in today\\'s data.'\n"
    "- Write 1-2 sentences maximum. Cite specific numbers. Present tense, factual tone.\n"
    "- No advice, no recommendations, no encouragement, no coaching, no filler. "
    "  You do not know better than the user — you only see the data they have logged."
)


def generate_momentum_insight(
    breakdown: dict,
    history: list,
    profile: dict,
    meals: list | None = None,
    workouts: list | None = None,
    garmin: dict | None = None,
    sleep: dict | None = None,
    hour: int | None = None,
) -> dict:
    """
    Generate a 1-2 sentence pattern insight using Claude Haiku.
    Returns {"insight": str, "generated_at": str}.
    """
    from datetime import datetime

    meals    = meals    or []
    workouts = workouts or []

    # ── time of day ──
    if hour is not None:
        if hour < 12:
            time_label = f"{hour}:00 AM"
        elif hour == 12:
            time_label = "12:00 PM"
        else:
            time_label = f"{hour - 12}:00 PM"
    else:
        time_label = "unknown"

    # ── 7-day history ──
    history_lines = []
    for row in history:
        history_lines.append(
            f"  {row['score_date']}: "
            f"nutrition={round(row['nutrition_pct'] * 100)}%, "
            f"activity={round(row['activity_pct'] * 100)}%, "
            f"checkin={'yes' if row['checkin_done'] else 'no'}, "
            f"tasks={round(row['task_rate'] * 100)}%"
        )
    history_text = "\n".join(history_lines) if history_lines else "  No history yet."

    # ── today's meals ──
    if meals:
        meal_lines = []
        for m in meals:
            parts = [m["description"]]
            if m.get("calories"):   parts.append(f"{m['calories']} kcal")
            if m.get("protein_g"):  parts.append(f"{round(m['protein_g'],1)}g protein")
            if m.get("carbs_g"):    parts.append(f"{round(m['carbs_g'],1)}g carbs")
            if m.get("fat_g"):      parts.append(f"{round(m['fat_g'],1)}g fat")
            meal_lines.append("  - " + " · ".join(parts))
        meals_text = "\n".join(meal_lines)
    else:
        meals_text = "  No meals logged yet today."

    # ── today's workouts ──
    if workouts:
        workout_lines = ["  - " + w["description"] + (f" ({w['calories_burned']} kcal burned)" if w.get("calories_burned") else "") for w in workouts]
        workouts_text = "\n".join(workout_lines)
    else:
        workouts_text = "  None logged."

    # ── Garmin ──
    if garmin:
        garmin_text = (
            f"  Steps: {garmin.get('steps', 0)}, "
            f"Active calories: {garmin.get('active_calories', 0)}, "
            f"Resting HR: {garmin.get('resting_hr') or 'N/A'}"
        )
    else:
        garmin_text = "  No Garmin data today."

    # ── sleep ──
    if sleep and sleep.get("total_seconds"):
        total_h = sleep["total_seconds"] // 3600
        total_m = (sleep["total_seconds"] % 3600) // 60
        rem_m   = (sleep.get("rem_seconds") or 0) // 60
        deep_m  = (sleep.get("deep_seconds") or 0) // 60
        score   = sleep.get("sleep_score")
        sleep_text = (
            f"  Duration: {total_h}h {total_m}m, "
            f"REM: {rem_m}m, Deep: {deep_m}m"
            + (f", Score: {score}/100" if score else "")
        )
    else:
        sleep_text = "  No sleep data."

    # ── component breakdown ──
    comps = breakdown.get("components", {})
    n = comps.get("nutrition", {})
    a = comps.get("activity",  {})
    c = comps.get("checkin",   {})
    t = comps.get("tasks",     {})
    w = comps.get("wellbeing", {})

    # ── profile ──
    primary_goal = profile.get("primary_goal") or profile.get("goals_raw")
    archetype    = profile.get("behavioral_archetype")
    leverage     = profile.get("biggest_leverage_point")
    obstacles    = profile.get("typical_obstacles_raw")
    wb_baseline  = profile.get("mood_baseline_1_10")

    # ── workout-adjusted calorie target ──
    rmr           = profile.get("rmr_kcal") or 0
    deficit       = profile.get("calorie_deficit_target") or 0
    active_burned = (garmin.get("active_calories") or 0) if garmin else \
                    sum(wk.get("calories_burned") or 0 for wk in workouts)
    if rmr:
        adj_target = int(rmr + active_burned - deficit)
    else:
        adj_target = n.get("calorie_goal")  # fallback to profile static goal
    cal_logged  = n.get("calories_logged", 0)
    remaining   = (adj_target - cal_logged) if adj_target else "unknown"
    # Eating hours left: assume window closes around 9 pm (21:00)
    hours_left  = max(0, 21 - hour) if hour is not None else "unknown"

    user_msg = f"""CURRENT TIME: {time_label}

TODAY'S DATA
SLEEP     | {sleep_text.strip()}
MOVEMENT  | steps={garmin.get('steps', 0) if garmin else 'N/A'}, burned={active_burned} kcal, workouts={len(workouts)} logged
NUTRITION | logged={cal_logged} kcal, target={adj_target} kcal, remaining={remaining} kcal, ~{hours_left}h left in eating window, protein={round(sum(m.get('protein_g',0) for m in meals),1)}g
HABITS    | morning_checkin={'done' if c.get('morning_done') else 'not done'}, evening_checkin={'done' if c.get('evening_done') else 'not done'}, tasks={t.get('completed', 0)}/{t.get('total', 0)} completed
WELLBEING | today={round((w.get('pct') or 0) * 10, 1)}/10, 7d_avg={w.get('past_7d_avg')}/10

7-DAY TREND (date | nutrition% | activity% | checkin_done | task_completion%):
{history_text}

Cross-check today's data against the 7-day trend. Report a genuine pattern only if the numbers clearly show one across two or more domains. Anchor your observation to the current time ({time_label}). Cite the specific numbers that show the pattern. If no real pattern is visible, say so."""

    response = _client().messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=160,
        system=_MOMENTUM_INSIGHT_SYSTEM,
        messages=[{"role": "user", "content": user_msg}],
    )
    insight_text = next(b.text for b in response.content if b.type == "text").strip()

    return {
        "insight":      insight_text,
        "generated_at": datetime.now().isoformat(),
    }


def parse_workout_plan(text: str) -> dict:
    response = _client().messages.create(
        model="claude-opus-4-6",
        max_tokens=1024,
        system=PLAN_PROMPT,
        messages=[{"role": "user", "content": text}],
    )
    raw = next(b.text for b in response.content if b.type == "text")
    data = _parse_json(raw)
    return {d: data.get(d, []) for d in _DAYS}
