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


def estimate_nutrition(meal_description: str) -> dict:
    response = _client().messages.create(
        model="claude-opus-4-6",
        max_tokens=256,
        system=NUTRITION_PROMPT,
        messages=[{"role": "user", "content": meal_description}],
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
