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
    text = next(b.text for b in response.content if b.type == "text").strip()
    start, end = text.find("{"), text.rfind("}") + 1
    if start == -1 or end == 0:
        return []
    data = json.loads(text[start:end])
    return [str(i).strip() for i in (data.get("ingredients") or []) if i]


# ── Meal suggestion ───────────────────────────────────

SUGGEST_PROMPT = """You are a personal nutrition coach. The user has told you what ingredients they have available. Suggest THREE different meal options that:
1. Are appropriate for the stated meal time
2. Use ingredients they actually have
3. Help them hit their remaining calorie target for the day
4. Respect their dietary preferences
5. Vary enough to give a real choice (e.g. light vs hearty, quick vs more involved)

Respond ONLY with this exact JSON structure (no markdown, no explanation):
{
  "options": [
    {
      "meal_name": "<2-5 word meal name>",
      "why": "<1 sentence: why this fits their goal right now>",
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
) -> dict:
    # Build context string from profile
    ctx_parts = [f"Meal time: {meal_type}"]
    if calories_remaining is not None:
        ctx_parts.append(f"Calories remaining today: {calories_remaining} kcal")
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
    text = next(b.text for b in response.content if b.type == "text")
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

    # ── workout-adjusted calorie target ──
    rmr           = profile.get("rmr_kcal") or 0
    deficit       = profile.get("calorie_deficit_target") or 0
    active_burned = (garmin.get("active_calories") or 0) if garmin else \
                    sum(wk.get("calories_burned") or 0 for wk in workouts)
    if rmr:
        adj_target = int(rmr + active_burned - deficit)
    else:
        adj_target = n.get("calorie_goal")
    cal_logged = n.get("calories_logged", 0)
    remaining  = (adj_target - cal_logged) if adj_target else "unknown"
    hours_left = max(0, 21 - hour) if hour is not None else "unknown"

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

    user_msg = f"""CURRENT TIME: {time_label}

TODAY
SLEEP     | {_fmt_sleep(sleep)}
MOVEMENT  | steps={garmin.get('steps', 0) if garmin else 'N/A'}, burned={active_burned} kcal, workouts={len(workouts)} logged
NUTRITION | logged={cal_logged} kcal, target={adj_target} kcal, remaining={remaining} kcal, ~{hours_left}h left in eating window, protein={round(sum(m.get('protein_g',0) for m in meals),1)}g
HABITS    | morning_checkin={'done' if c.get('morning_done') else 'not done'}, evening_checkin={'done' if c.get('evening_done') else 'not done'}, tasks={t.get('completed', 0)}/{t.get('total', 0)} completed

RECENT HISTORY (date | sleep | steps | active burn | calories logged | protein | checkin | task completion):
{history_text}

Scan all of the above data — today and every historical row — for a genuine pattern across two or more domains (sleep, movement, nutrition, habits). Anchor any observation to the current time ({time_label}). Cite specific numbers. If no real pattern is visible in the data, say so."""

    response = _client().messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=200,
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
