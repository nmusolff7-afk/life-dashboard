import json
import logging
import os

from ai_client import get_client as _client

logger = logging.getLogger(__name__)

# ── Nutrition estimation ───────────────────────────────

NUTRITION_PROMPT = """You are a nutrition expert. When given a meal description in plain English,
estimate the nutritional content BY ITEMIZING EVERY INDIVIDUAL COMPONENT separately,
then summing to a total. Always respond with a valid JSON object and nothing else.
Use your best judgment for portion sizes when not specified.

Respond ONLY with this exact JSON structure (no markdown, no explanation):
{
  "items": [
    {
      "name": "<item name with portion, e.g. '2 scrambled eggs'>",
      "calories": <integer>,
      "protein_g": <number with one decimal>,
      "carbs_g": <number with one decimal>,
      "fat_g": <number with one decimal>
    }
  ],
  "calories": <integer total — sum of all items>,
  "protein_g": <number with one decimal — sum of all items>,
  "carbs_g": <number with one decimal — sum of all items>,
  "fat_g": <number with one decimal — sum of all items>,
  "notes": "<brief note about assumptions made, if any>"
}

Rules:
- ALWAYS break the meal into individual items, even if only one item is described.
- Each item should include the portion/quantity in its name.
- The top-level totals MUST equal the exact sum of all items.
- For complex meals (e.g. a burrito), break into component ingredients (tortilla, rice, beans, meat, cheese, etc.)."""


def _parse_json(text: str) -> dict:
    import re
    text = text.strip()
    # Try markdown fenced block first
    m = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if m:
        text = m.group(1).strip()
    # If still not valid JSON, try to find the outermost { ... }
    if not text.startswith("{"):
        m2 = re.search(r"\{[\s\S]*\}", text)
        if m2:
            text = m2.group(0)
    return json.loads(text.strip())


def _parse_nutrition_items(data: dict) -> list[dict]:
    return [{
        "name":      item.get("name", ""),
        "calories":  int(item.get("calories", 0)),
        "protein_g": float(item.get("protein_g", 0)),
        "carbs_g":   float(item.get("carbs_g", 0)),
        "fat_g":     float(item.get("fat_g", 0)),
    } for item in (data.get("items") or [])]


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
        max_tokens=1024,
        system=NUTRITION_PROMPT,
        messages=[{"role": "user", "content": user_content}],
    )
    text = next((b.text for b in response.content if b.type == "text"), "")
    data = _parse_json(text)
    return {
        "calories":  int(data["calories"]),
        "protein_g": float(data["protein_g"]),
        "carbs_g":   float(data["carbs_g"]),
        "fat_g":     float(data["fat_g"]),
        "items":     _parse_nutrition_items(data),
        "notes":     data.get("notes", ""),
    }


# ── Meal image scanning ───────────────────────────────

SCAN_PROMPT = """You are a nutrition expert analyzing a photo of food.
Identify what food or meal is shown and estimate its nutritional content
BY ITEMIZING EVERY INDIVIDUAL COMPONENT separately, then summing to a total.

Respond ONLY with this exact JSON structure (no markdown, no explanation):
{
  "description": "<2-5 word meal name>",
  "items": [
    {
      "name": "<item name with portion, e.g. 'grilled chicken breast ~6oz'>",
      "calories": <integer>,
      "protein_g": <number with one decimal>,
      "carbs_g": <number with one decimal>,
      "fat_g": <number with one decimal>
    }
  ],
  "calories": <integer total — sum of all items>,
  "protein_g": <number with one decimal — sum of all items>,
  "carbs_g": <number with one decimal — sum of all items>,
  "fat_g": <number with one decimal — sum of all items>,
  "notes": "<brief note about what you see and portion assumptions>"
}

Rules:
- ALWAYS break the meal into individual items, even if only one item is visible.
- Each item should include the estimated portion/quantity in its name.
- The top-level totals MUST equal the exact sum of all items.
- For complex dishes, break into component ingredients.
- Be realistic about portion sizes based on what is visible in the image."""


def scan_meal_image(image_b64: str, media_type: str, context: str = "") -> dict:
    prompt = SCAN_PROMPT
    if context:
        prompt += f"\n\nAdditional context from the user: {context}"
    response = _client().messages.create(
        model="claude-opus-4-6",
        max_tokens=1024,
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
    text = next((b.text for b in response.content if b.type == "text"), "")
    data = _parse_json(text)
    return {
        "description": data.get("description", "Meal from photo"),
        "calories":    int(data["calories"]),
        "protein_g":   float(data["protein_g"]),
        "carbs_g":     float(data["carbs_g"]),
        "fat_g":       float(data["fat_g"]),
        "items":       _parse_nutrition_items(data),
        "notes":       data.get("notes", ""),
    }


# ── Ingredient identification from photos ─────────────

IDENTIFY_PROMPT = """Look at the provided image(s) and list every distinct food item, ingredient, condiment, or beverage you can identify.
Be specific but concise (e.g. "Greek yogurt" not just "yogurt", "broccoli" not "vegetables").
Return ONLY valid JSON with no markdown:
{"ingredients": ["item1", "item2", ...]}
If no food items are visible, return {"ingredients": []}."""


def identify_ingredients(images: list) -> list[str]:
    """Identify food ingredients from one or more images. Returns a list of ingredient strings."""
    if not images:
        return []
    content = []
    for img in images:
        content.append({
            "type": "image",
            "source": {"type": "base64", "media_type": img["media_type"], "data": img["b64"]},
        })
    content.append({"type": "text", "text": IDENTIFY_PROMPT})
    response = _client().messages.create(
        model="claude-opus-4-6",
        max_tokens=400,
        messages=[{"role": "user", "content": content}],
    )
    text = next((b.text for b in response.content if b.type == "text"), "").strip()
    start, end = text.find("{"), text.rfind("}") + 1
    if start == -1 or end == 0:
        return []
    data = json.loads(text[start:end])
    return [str(i).strip() for i in (data.get("ingredients") or []) if i]


# ── Meal suggestion ───────────────────────────────────

SUGGEST_PROMPT = """You are a personal nutrition coach. The user has told you what ingredients they have available. Suggest THREE different meal options that:
1. Are appropriate for the stated meal time
2. Use ingredients they actually have
3. FIT WITHIN their remaining calorie budget — each meal's calories MUST be at or below the "Calories remaining today" value
4. Help them get as close as possible to their remaining macro targets (protein, carbs, fat) — prioritize hitting protein first, then balance carbs and fat
5. Respect their dietary preferences
6. Vary enough to give a real choice (e.g. light vs hearty, quick vs more involved)

IMPORTANT: The calorie and macro remaining values represent what the user has LEFT to eat today.
Do NOT suggest meals that exceed the remaining calorie budget. If the budget is small (e.g. under 300 kcal),
suggest appropriately light meals or snacks. If macros remaining are provided, tailor suggestions to close
the gap — for example if protein remaining is high relative to calories, suggest protein-dense options.

Respond ONLY with this exact JSON structure (no markdown, no explanation):
{
  "options": [
    {
      "meal_name": "<2-5 word meal name>",
      "why": "<1 sentence: why this fits their calorie and macro goals right now>",
      "instructions": "<brief recipe: 2-4 steps separated by | >",
      "calories": <integer>,
      "protein_g": <number with one decimal>,
      "carbs_g": <number with one decimal>,
      "fat_g": <number with one decimal>
    },
    { ... },
    { ... }
  ],
  "identified_ingredients": ["<ingredient>", ...]
}

The identified_ingredients array should contain every distinct ingredient visible in any photos OR mentioned by the user — normalized to simple names (e.g. "chicken breast", "eggs", "broccoli"). Real food items only."""


def suggest_meal(
    ingredients: str,
    images: list,           # [{b64: str, media_type: str}]
    profile_map: dict | None,
    calories_remaining: int | None,
    meal_type: str,         # "breakfast", "lunch", "dinner", "snack"
    macro_remaining: dict | None = None,
) -> dict:
    # Build context string from profile
    ctx_parts = [f"Meal time: {meal_type}"]
    if calories_remaining is not None:
        ctx_parts.append(f"Calories remaining today: {calories_remaining} kcal")
    if macro_remaining:
        ctx_parts.append(
            f"Macros remaining today: "
            f"{macro_remaining['protein_remaining_g']:.0f}g protein, "
            f"{macro_remaining['carbs_remaining_g']:.0f}g carbs, "
            f"{macro_remaining['fat_remaining_g']:.0f}g fat"
        )
    if profile_map:
        for key, label in [
            ("diet_type",            "Diet style"),
            ("dietary_restrictions", "Restrictions/allergies"),
            ("foods_disliked_list",  "Foods to avoid"),
        ]:
            val = profile_map.get(key)
            if val:
                ctx_parts.append(f"{label}: {val}")

    context_text = "\n".join(ctx_parts)
    if ingredients.strip():
        context_text += f"\n\nAvailable ingredients: {ingredients.strip()}"
    if images:
        context_text += f"\n\n{len(images)} photo(s) attached — use them to identify additional ingredients."

    # Build message content
    content = []
    for img in images[:6]:
        content.append({
            "type": "image",
            "source": {
                "type":       "base64",
                "media_type": img["media_type"],
                "data":       img["b64"],
            },
        })
    content.append({"type": "text", "text": context_text})

    response = _client().messages.create(
        model="claude-opus-4-6",
        max_tokens=1200,
        system=SUGGEST_PROMPT,
        messages=[{"role": "user", "content": content}],
    )
    text = next((b.text for b in response.content if b.type == "text"), "")
    data = _parse_json(text)
    raw_options = data.get("options") or []
    options = []
    for opt in raw_options[:3]:
        try:
            options.append({
                "meal_name":  opt.get("meal_name", "Suggested Meal"),
                "why":        opt.get("why", ""),
                "instructions": opt.get("instructions", ""),
                "calories":   int(opt["calories"]),
                "protein_g":  float(opt["protein_g"]),
                "carbs_g":    float(opt["carbs_g"]),
                "fat_g":      float(opt["fat_g"]),
            })
        except (KeyError, TypeError, ValueError):
            continue
    raw_ingredients = data.get("identified_ingredients") or []
    if not isinstance(raw_ingredients, list):
        raw_ingredients = []
    return {
        "options":                options,
        "identified_ingredients": [str(i).strip() for i in raw_ingredients if i],
    }


# ── Workout burn estimation ────────────────────────────

BURN_PROMPT = """You are a fitness expert. Given a workout description in plain English,
estimate the NET calories burned — that is, only the EXTRA calories burned above what the person
would have burned at rest (resting metabolic rate) during that same time period. Do NOT include
the baseline calories the body burns just to stay alive; only count the additional expenditure
caused by the physical activity itself.

Use your best judgment for intensity and duration when not specified.

Respond ONLY with this exact JSON structure (no markdown, no explanation):
{
  "calories_burned": <integer>,
  "notes": "<brief note about assumptions made, if any>"
}"""


def estimate_burn(workout_description: str, profile_map: dict | None = None) -> dict:
    user_content = workout_description
    if profile_map:
        # Build a readable height string: prefer total inches, fall back to ft+in components
        ht_total = profile_map.get("height_inches")
        ht_ft    = profile_map.get("height_ft")
        ht_in    = profile_map.get("height_in")
        if ht_total:
            height = f"{ht_total} inches ({int(ht_total) // 12}'{int(ht_total) % 12}\")"
        elif ht_ft is not None and ht_in is not None:
            height = f"{ht_ft}'{ht_in}\""
        else:
            height = None

        fields = {
            "weight_lbs":    profile_map.get("cur_weight_lbs") or profile_map.get("curWeight") or profile_map.get("current_weight_lbs"),
            "height":        height,
            "age":           profile_map.get("age"),
            "gender":        profile_map.get("gender") or profile_map.get("sex"),
            "fitness_level": profile_map.get("fitness_experience_level") or profile_map.get("fitness_level") or profile_map.get("activity_level"),
        }
        populated = {k: v for k, v in fields.items() if v is not None}
        if populated:
            context = "\n\nUser stats (use for an accurate personalised estimate):\n"
            context += "\n".join(f"- {k}: {v}" for k, v in populated.items())
            user_content = workout_description + context

    response = _client().messages.create(
        model="claude-opus-4-6",
        max_tokens=300,
        system=BURN_PROMPT,
        messages=[{"role": "user", "content": user_content}],
    )
    text = next((b.text for b in response.content if b.type == "text"), "")
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
    return next((b.text for b in response.content if b.type == "text"), "").strip()


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


_GENERATE_PLAN_PROMPT = """You are a certified personal trainer. Create a structured weekly workout plan.

Goal: {goal}
Days per week: {days_per_week}
Experience: {experience}

{split_instruction}

Respond ONLY with this exact JSON (no markdown, no explanation):
{{
  "Monday":    [{{"name": "<exercise>", "sets": <int>}}],
  "Tuesday":   [...],
  "Wednesday": [...],
  "Thursday":  [...],
  "Friday":    [...],
  "Saturday":  [...],
  "Sunday":    []
}}

Rules:
- Include all 7 days. Use [] for rest days.
- Each training day MUST follow its assigned split label — do NOT mix muscle groups across days.
- Use only common exercises: Squat, Bench Press, Deadlift, Overhead Press, Barbell Row, Pull Up, Lat Pulldown, Leg Press, Leg Curl, Leg Extension, Dumbbell Curl, Tricep Pushdown, Lateral Raise, Face Pull, Cable Row, Dumbbell Row, Incline Bench Press, Romanian Deadlift, Hip Thrust, Calf Raise, Plank, Dumbbell Fly.
- Do NOT include reps in the name. Sets should be 3-4.
- Exercise names must be clean title-case.
- 4-6 exercises per training day."""


_SPLIT_TEMPLATES = {
    1: "Full Body on 1 day. Pick one compound per major muscle group.",
    2: "Upper/Lower split: Day 1 = Upper Body (chest, back, shoulders, arms), Day 2 = Lower Body (quads, hamstrings, glutes, calves).",
    3: "Push/Pull/Legs split: Day 1 = Push (chest, shoulders, triceps), Day 2 = Pull (back, biceps, rear delts), Day 3 = Legs (quads, hamstrings, glutes, calves).",
    4: "Upper/Lower split repeated: Day 1 = Upper A, Day 2 = Lower A, Day 3 = Upper B (different exercises), Day 4 = Lower B (different exercises). Spread across the week with rest days between.",
    5: "Push/Pull/Legs/Upper/Lower split: Day 1 = Push, Day 2 = Pull, Day 3 = Legs, Day 4 = Upper, Day 5 = Lower.",
    6: "Push/Pull/Legs repeated twice: Day 1 = Push A, Day 2 = Pull A, Day 3 = Legs A, Day 4 = Push B, Day 5 = Pull B, Day 6 = Legs B. Use different exercises for A and B variants.",
    7: "Push/Pull/Legs + Upper/Lower + Full Body + Active Recovery: Day 1 = Push, Day 2 = Pull, Day 3 = Legs, Day 4 = Upper, Day 5 = Lower, Day 6 = Full Body (light), Day 7 = Active Recovery (mobility, stretching — use Plank and bodyweight exercises only).",
}


def generate_workout_plan(goal: str, days_per_week: int = 3, experience: str = "beginner") -> dict:
    """Generate a structured weekly workout plan based on goal and preferences."""
    goal_labels = {
        "lose_weight": "fat loss — compound lifts to preserve muscle, moderate volume",
        "build_muscle": "muscle gain — hypertrophy focus, progressive overload, higher volume",
        "recomp": "body recomposition — moderate volume, compound-heavy, balanced",
        "maintain": "maintenance — moderate volume to preserve strength and muscle",
    }
    days = max(1, min(7, days_per_week))
    split = _SPLIT_TEMPLATES.get(days, _SPLIT_TEMPLATES[3])
    prompt = _GENERATE_PLAN_PROMPT.format(
        goal=goal_labels.get(goal, goal),
        days_per_week=days,
        experience=experience,
        split_instruction="SPLIT STRUCTURE:\n" + split,
    )
    response = _client().messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1024,
        system=prompt,
        messages=[{"role": "user", "content": "Generate my workout plan."}],
    )
    raw = next((b.text for b in response.content if b.type == "text"), "")
    data = _parse_json(raw)
    return {d: data.get(d, []) for d in _DAYS}


def generate_comprehensive_plan(payload: dict) -> dict:
    """Generate a full strength + cardio plan from the workout builder quiz payload."""
    prompt = f"""You are an evidence-based certified personal trainer and exercise scientist.
You have been given a comprehensive user profile and quiz payload. Generate a complete
weekly training plan — both a STRENGTH plan and a CARDIO plan — as two separate JSON objects.

USER PAYLOAD:
{json.dumps(payload, indent=2)}

INSTRUCTIONS:
1. Read every field in the payload carefully. The aiFlags object contains critical
   programming constraints — respect all of them.
2. The schedule.trainingDays array contains the SPECIFIC days the user can train.
   Map your plan to those exact days.
3. If selectedExercises is non-empty, you MUST include every listed exercise at least
   once per week. Do not omit or substitute unless physicalConstraints directly
   contraindicate it — in that case, flag the conflict explicitly.
4. If physicalConstraints is not null, treat it as a mandatory constraint. Exclude any
   exercise that directly loads the affected structure. Substitute a safe alternative
   and add a note explaining the substitution.
5. Use the experience level to calibrate coaching cue density, progression model,
   and exercise complexity.
6. Respect all volume adjustments from aiFlags (sleep, stress, activity reductions).
7. For cardio: respect the cardio.preference and cardio.committedCardioType. If
   committedCardioType is "running", schedule resistance and running on separate days
   where possible, resistance first if same-day, 6hr minimum separation.

RESPONSE FORMAT — respond ONLY with valid JSON, no markdown fencing, no explanation:
The JSON must have three top-level keys: "strengthPlan", "cardioPlan", "planNotes".

strengthPlan: object with all 7 day keys (Monday through Sunday).
  Training days: {{"label": "Push Day", "exercises": [{{"name": "Bench Press", "sets": 4, "reps": "8-12", "rest": "90s", "notes": null}}]}}
  Rest days: null

cardioPlan: object with all 7 day keys (Monday through Sunday).
  Cardio days: {{"type": "Easy Run", "duration": "30 min", "intensity": "Zone 2", "notes": null, "committed": false}}
  No-cardio days: null

planNotes: array of strings with key programming decisions.

Rules:
- Include all 7 days in both strengthPlan and cardioPlan.
- Use null for rest/off days, not empty objects.
- Exercise names must be clean title-case.
- If the user selected 0 training days (recoveryOnly flag), return a mobility/recovery plan instead.
- Rep ranges should be goal-appropriate: strength 3-6, hypertrophy 8-15, endurance 15-20.
- Rest periods: compound 2-3min, isolation 60-90s, circuits 30-45s.
- Respect sessionLength constraints on exercise count.
"""

    response = _client().messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=8192,
        messages=[{"role": "user", "content": prompt}],
    )
    raw = next((b.text for b in response.content if b.type == "text"), "")
    return _parse_json(raw)


def generate_plan_understanding(payload: dict) -> str:
    """Generate a short AI paragraph demonstrating understanding of the user's plan."""
    prompt = f"""You are a personal trainer who just finished designing a workout plan for a client.
Write a 3-5 sentence paragraph that:
- Demonstrates you understood their specific goals, constraints, and lifestyle
- Acknowledges any notable tensions (e.g. daily running + hypertrophy goal, minimal equipment + mass goal)
- Briefly explains key programming choices you made
- Is personal, direct, written in second person
- Does NOT use filler phrases like "Great news!" or "I'd be happy to..."
- Does NOT read like a form letter

USER PAYLOAD:
{json.dumps(payload, indent=2)}

Respond with ONLY the paragraph text — no quotes, no labels, no markdown."""

    response = _client().messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=300,
        messages=[{"role": "user", "content": prompt}],
    )
    return next((b.text for b in response.content if b.type == "text"), "").strip()


def revise_plan(payload: dict, current_plan: dict, change_request: str) -> dict:
    """Revise an existing plan based on user feedback."""
    prompt = f"""You are an evidence-based personal trainer. The user wants to modify their workout plan.

ORIGINAL PAYLOAD:
{json.dumps(payload, indent=2)}

CURRENT PLAN:
{json.dumps(current_plan, indent=2)}

USER'S CHANGE REQUEST:
{change_request}

Apply the requested changes while keeping the rest of the plan intact. Respect all
original constraints from the payload (physical constraints, equipment, etc.).

Respond ONLY with the same JSON structure as the current plan — strengthPlan, cardioPlan,
and planNotes. No markdown, no explanation outside the JSON."""

    response = _client().messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=8192,
        messages=[{"role": "user", "content": prompt}],
    )
    raw = next((b.text for b in response.content if b.type == "text"), "")
    return _parse_json(raw)


# ── Multi-scale momentum summary ─────────────────────

_SCALE_SUMMARY_PROMPT = """You are a concise health data reporter for a personal fitness app. You summarize the user's tracking data at a specific time scale.

The user's goal is: {goal_label}
Time scale: {scale}
Current date and time: {current_datetime}

You will receive the user's daily scores and deltas for the period. Items marked "pending" have not been tracked YET — the user still has time. Do NOT count pending items as failures or missed targets.

Respond with EXACTLY one paragraph — no bullet points, no headers, no extra text:

For "day" scale:
If it's early (before noon): focus on what's been done so far and what's still ahead. Don't criticize unlogged meals or workouts — they haven't happened yet.
If it's later: summarize actual progress with numbers. Note what went well and what fell short.

For "week" scale:
"This week you averaged [X]/100 across [N] days. [Key pattern]. [One actionable sentence]."

For "month" scale:
"Over the last 30 days your average score was [X]/100. [Trend]. Against your {goal_label} goal, you are [on track / drifting / making strong progress]. [One sentence on biggest area for improvement]."

Rules:
- Use actual numbers from the data, not vague language
- Keep it under 60 words
- No motivational fluff — just the data and what it means
- Reference the user's goal by name
- NEVER penalize the user for data that is marked as pending"""


def generate_scale_summary(scale: str, goal_label: str, history: list) -> str:
    """Generate a structured summary for day/week/month scale.

    history: list of {score_date, momentum_score, raw_deltas (JSON string or dict)}
    """
    import json as _json
    from datetime import datetime as _dt

    if not history:
        return "Not enough data yet for a summary."

    # Build data summary for the prompt
    scores = [h["momentum_score"] for h in history]
    avg_score = round(sum(scores) / len(scores), 1) if scores else 0

    lines = []
    for h in history[-7:]:  # Last 7 entries max to keep prompt short
        deltas = h.get("raw_deltas", "{}")
        if isinstance(deltas, str):
            try:
                deltas = _json.loads(deltas)
            except Exception:
                deltas = {}
        cal_d = deltas.get("calories", {})
        pro_d = deltas.get("protein", {})
        wk_d  = deltas.get("workout", {})
        cal_status = "pending" if cal_d.get("pending") else f"{cal_d.get('actual', '?')}/{cal_d.get('target', '?')}"
        pro_status = "pending" if pro_d.get("pending") else f"{pro_d.get('actual', '?')}/{pro_d.get('target', '?')}g"
        wk_status  = "pending" if wk_d.get("pending") else ("yes" if wk_d.get("done") else "no")
        lines.append(
            f"{h['score_date']}: score={h['momentum_score']}, "
            f"cal={cal_status}, protein={pro_status}, workout={wk_status}"
        )

    data_text = "\n".join(lines)
    data_text += f"\n\nPeriod average score: {avg_score}/100 over {len(scores)} day(s)."

    now_str = _dt.now().strftime("%Y-%m-%d %I:%M %p")
    prompt = _SCALE_SUMMARY_PROMPT.format(
        goal_label=goal_label,
        scale=scale,
        current_datetime=now_str,
    )

    try:
        response = _client().messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=200,
            system=prompt,
            messages=[{"role": "user", "content": data_text}],
        )
        return response.content[0].text.strip()
    except Exception as e:
        logger.error("Scale summary generation failed: %s", e)
        return "Summary unavailable — try again later."


# ── Momentum pattern insight ──────────────────────────

_MOMENTUM_INSIGHT_SYSTEM = (
    "You are a data reporter for a personal health tracking app. Your only job is to read the user's numbers "
    "and tell them what those numbers show — nothing more.\n\n"
    "Rules:\n"
    "- Write 1-2 sentences only. Plain, simple language that anyone can understand — no jargon.\n"
    "- If a genuine cross-domain pattern is visible in the data (e.g. poor sleep and low steps, "
    "  high calories and a workout both on the same days), report it with specific numbers.\n"
    "- If no clear cross-domain pattern is visible, instead give a simple snapshot: pick 1-2 of the most "
    "  meaningful metrics available (calories logged vs goal, steps vs a typical day, sleep hours, protein) "
    "  and state plainly where the user stands today or this week compared to their target or recent average. "
    "  Always cite specific numbers from the data provided.\n"
    "- Use the TIME field to anchor your analysis. Morning = focus on overnight/yesterday data. "
    "  Afternoon = today so far. Evening = full-day view.\n"
    "- Factual, present-tense tone. No advice, no recommendations, no coaching, no praise or criticism. "
    "  You are only reporting what the data shows. You do not know better than the user."
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
    garmin_hist: dict | None = None,
    sleep_hist: dict | None = None,
    meal_hist: dict | None = None,
    workout_hist: dict | None = None,
    tdee: int | None = None,
    cal_consumed: int = 0,
) -> dict:
    """
    Generate a 1-2 sentence pattern insight using Claude Haiku.
    Returns {"insight": str, "generated_at": str}.
    """
    from datetime import datetime

    meals        = meals        or []
    workouts     = workouts     or []
    garmin_hist  = garmin_hist  or {}
    sleep_hist   = sleep_hist   or {}
    meal_hist    = meal_hist    or {}
    workout_hist = workout_hist or {}

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

    # ── today's sleep ──
    def _fmt_sleep(s):
        if not s or not s.get("total_seconds"):
            return "no data"
        h = s["total_seconds"] // 3600
        m = (s["total_seconds"] % 3600) // 60
        rem  = (s.get("rem_seconds")  or 0) // 60
        deep = (s.get("deep_seconds") or 0) // 60
        return f"{h}h{m}m (REM {rem}m, deep {deep}m)"

    # ── component breakdown (for today's checkin/task status only) ──
    comps = breakdown.get("components", {})
    c = comps.get("checkin", {})
    t = comps.get("tasks",   {})
    n = comps.get("nutrition", {})

    # ── calorie numbers ──
    # Use values passed directly from the client (CURRENT_TDEE and CAL_CONSUMED),
    # which already incorporate the full TDEE formula (RMR + NEAT + exercise + TEF).
    deficit    = profile.get("calorie_deficit_target") or 0
    adj_target = (tdee - deficit) if tdee else None
    cal_logged = cal_consumed
    remaining  = (adj_target - cal_logged) if adj_target is not None else "unknown"
    hours_left = max(0, 21 - hour) if hour is not None else "unknown"
    active_burned = (garmin.get("active_calories") or 0) if garmin else \
                    sum(wk.get("calories_burned") or 0 for wk in workouts)

    # ── build per-day historical table ──
    # Collect all dates seen across any data source
    all_dates = sorted(set(
        list(garmin_hist.keys()) +
        list(sleep_hist.keys()) +
        list(meal_hist.keys()) +
        list(workout_hist.keys()) +
        [row["score_date"] for row in history]
    ))

    # Build checkin/task lookup from momentum history rows (stripped of scores)
    checkin_lookup = {row["score_date"]: row for row in history}

    history_lines = []
    for d in all_dates:
        g  = garmin_hist.get(d, {})
        s  = sleep_hist.get(d, {})
        mn = meal_hist.get(d, {})
        wh = workout_hist.get(d, {})
        hr = checkin_lookup.get(d, {})

        steps      = g.get("steps")        or "—"
        burn       = g.get("active_calories") or sum(w.get("calories_burned", 0) for w in wh) or "—"
        sleep_dur  = _fmt_sleep(s) if s else "—"
        cals       = int(mn.get("calories", 0)) if mn.get("calories") else "—"
        protein    = f"{round(mn.get('protein', 0))}g" if mn.get("protein") else "—"
        checkin    = "yes" if hr.get("checkin_done") else ("no" if hr else "—")
        task_r     = f"{round(hr['task_rate']*100)}%" if hr.get("task_rate") is not None else "—"

        history_lines.append(
            f"  {d} | sleep={sleep_dur} | steps={steps} | burn={burn} kcal"
            f" | cals={cals} | protein={protein} | checkin={checkin} | tasks={task_r}"
        )

    history_text = "\n".join(history_lines) if history_lines else "  No history yet."

    balance = (cal_logged - tdee) if tdee else None
    balance_label = f"{balance:+d} kcal" if balance is not None else "unknown"

    user_msg = f"""CURRENT TIME: {time_label}

TODAY
TDEE (total daily burn): {tdee or 'unknown'} kcal
Calories consumed: {cal_logged} kcal
Balance (consumed − burned): {balance_label}
Goal deficit target: {deficit} kcal
Hours left in eating window: ~{hours_left}h

Give a brief, practical observation about today's calorie balance relative to the goal. Anchor to the current time ({time_label}). Cite specific numbers. One to two sentences max."""

    response = _client().messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=200,
        system=_MOMENTUM_INSIGHT_SYSTEM,
        messages=[{"role": "user", "content": user_msg}],
    )
    insight_text = next((b.text for b in response.content if b.type == "text"), "").strip()

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
    raw = next((b.text for b in response.content if b.type == "text"), "")
    data = _parse_json(raw)
    return {d: data.get(d, []) for d in _DAYS}
