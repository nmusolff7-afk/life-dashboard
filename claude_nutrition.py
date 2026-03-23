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
        max_tokens=256,
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
        max_tokens=256,
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
        max_tokens=128,
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
        max_tokens=24,
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
    "You are an analytical assistant reviewing health and habit data. "
    "Write exactly 1-2 short sentences identifying one specific pattern. "
    "Be direct and factual. No encouragement, no advice, no filler."
)


def generate_momentum_insight(breakdown: dict, history: list, profile: dict) -> dict:
    """
    Generate a 2-3 sentence pattern insight from Momentum data using Claude Haiku.
    Returns {"insight": str, "data_used": [str, ...], "generated_at": str}.
    """
    from datetime import datetime

    # Build 7-day history lines
    history_lines = []
    for row in history:
        history_lines.append(
            f"  {row['score_date']}: score={row['momentum_score']}, "
            f"nutrition={round(row['nutrition_pct'] * 100)}%, "
            f"activity={round(row['activity_pct'] * 100)}%, "
            f"checkin={'yes' if row['checkin_done'] else 'no'}, "
            f"tasks={round(row['task_rate'] * 100)}%"
        )
    history_text = "\n".join(history_lines) if history_lines else "  No history yet."

    comps   = breakdown.get("components", {})
    n       = comps.get("nutrition", {})
    p       = comps.get("protein", {})
    a       = comps.get("activity", {})
    c       = comps.get("checkin", {})
    t       = comps.get("tasks", {})
    w       = comps.get("wellbeing", {})

    primary_goal        = profile.get("primary_goal") or profile.get("goals_raw")
    behavioral_archetype= profile.get("behavioral_archetype")
    biggest_leverage    = profile.get("biggest_leverage_point")
    obstacles           = profile.get("typical_obstacles_raw")
    wellbeing_baseline  = profile.get("mood_baseline_1_10")

    user_msg = f"""Here is the user's Momentum data for the last 7 days:
{history_text}

Today's component breakdown:
- Nutrition: {round(n.get('pct', 0) * 100)}% of {n.get('calorie_goal')} kcal goal ({n.get('calories_logged')} logged)
- Protein: {round(p.get('pct', 0) * 100)}% of {p.get('protein_goal_g')}g goal ({p.get('protein_logged_g')}g logged)
- Activity: {round(a.get('pct', 0) * 100)}% (active calories: {a.get('active_calories')}, target: {a.get('target_calories')})
- Check-in completed: {"yes" if c.get('morning_done') or c.get('evening_done') else "no"}
- Tasks: {t.get('completed')} of {t.get('total')} completed
- Wellbeing: {w.get('avg_today')}/10 vs personal baseline of {wellbeing_baseline}/10

User profile context:
- Primary goal: {primary_goal}
- Behavioral archetype: {behavioral_archetype}
- Biggest leverage point: {biggest_leverage}
- Self-reported main obstacle: {obstacles}

In 1-2 sentences, state one specific pattern from the numbers. Do not end with a data citation."""

    response = _client().messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=256,
        system=_MOMENTUM_INSIGHT_SYSTEM,
        messages=[{"role": "user", "content": user_msg}],
    )
    insight_text = next(b.text for b in response.content if b.type == "text").strip()

    # Build data_used from non-null inputs
    data_used = []
    if history_lines:
        data_used.append("7-day momentum history")
    if n.get("calorie_goal"):
        data_used.append(f"calorie goal ({n['calorie_goal']} kcal)")
    if n.get("calories_logged"):
        data_used.append(f"calories logged ({n['calories_logged']})")
    if p.get("protein_goal_g"):
        data_used.append(f"protein goal ({p['protein_goal_g']}g)")
    if p.get("protein_logged_g"):
        data_used.append(f"protein logged ({p['protein_logged_g']}g)")
    if a.get("active_calories") is not None:
        data_used.append(f"active calories ({a['active_calories']})")
    if c.get("morning_done") or c.get("evening_done"):
        data_used.append("check-in completion")
    if t.get("total"):
        data_used.append(f"tasks ({t.get('completed', 0)}/{t['total']})")
    if w.get("avg_today") is not None:
        data_used.append(f"wellbeing score ({w['avg_today']}/10)")
    if wellbeing_baseline:
        data_used.append(f"wellbeing baseline ({wellbeing_baseline}/10)")
    if primary_goal:
        data_used.append("primary goal")
    if behavioral_archetype:
        data_used.append("behavioral archetype")
    if biggest_leverage:
        data_used.append("leverage point")
    if obstacles:
        data_used.append("self-reported obstacles")

    return {
        "insight":      insight_text,
        "data_used":    data_used,
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
