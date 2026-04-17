"""
Claude — user profile generation from onboarding data.
"""
import json
import logging
import os

from ai_client import get_client as _client

logger = logging.getLogger(__name__)


# ── 200-variable schema (all keys, all None by default) ──────────────────────

PROFILE_SCHEMA = {
    # Identity
    "first_name": None, "age": None, "gender": None,
    # Physical body
    "height_ft": None, "height_in": None,
    "current_weight_lbs": None, "target_weight_lbs": None,
    "body_fat_pct": None, "bmi": None,
    "rmr_kcal": None,
    "daily_calorie_goal": None, "daily_protein_goal_g": None,
    "lbs_to_goal": None, "weeks_to_goal": None,
    # Goals
    "primary_goal": None,
    # Lifestyle
    "occupation_description": None, "work_style": None,
    "stress_level_1_10": None, "steps_per_day_estimated": None,
    # Mental
    "energy_level_typical_1_10": None, "mood_baseline_1_10": None,
    # AI-generated insights
    "biggest_leverage_point": None,
    "personalized_insight": None,
    "behavioral_archetype": None,
    "one_sentence_summary": None,
}


PROFILE_GENERATION_PROMPT = """You are a personal fitness coach generating a user profile from onboarding answers.

Fill in the JSON fields below. Keep it concise:
- Calculate BMI from height/weight. Calculate RMR using Mifflin-St Jeor.
- "behavioral_archetype": one word (e.g. "Optimizer", "Steady", "Sprinter", "Explorer")
- "one_sentence_summary": one sentence describing this person's situation
- "personalized_insight": 1-2 sentences that show you understand their specific situation
- "biggest_leverage_point": the single most impactful change they could make
- Copy over raw input fields directly (first_name, age, gender, height, weight, goal, etc.)
- If target_weight_lbs is null or missing, that means the user did NOT enter a goal weight — it does NOT mean they want to maintain their current weight. Do not assume their goal is weight maintenance just because no target was given.
- Leave fields as null only if there is no data to derive them from

Respond ONLY with a valid JSON object. No markdown, no explanation."""


def generate_profile_map(raw_inputs: dict) -> dict:
    """Run Claude Haiku on the collected onboarding data and return filled profile map."""
    schema_keys = json.dumps(list(PROFILE_SCHEMA.keys()), indent=2)
    user_content = (
        f"USER ONBOARDING RESPONSES:\n{json.dumps(raw_inputs)}\n\n"
        f"EXACT JSON KEYS YOU MUST USE (use these exact key names, no others):\n{schema_keys}\n\n"
        f"Generate the complete profile map JSON now using ONLY the keys listed above."
    )

    response = _client().messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1024,
        timeout=60.0,
        system=PROFILE_GENERATION_PROMPT,
        messages=[{"role": "user", "content": user_content}],
    )
    import re
    text = next((b.text for b in response.content if b.type == "text"), "").strip()
    m = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if m:
        text = m.group(1).strip()
    data = json.loads(text)
    # Merge with schema defaults so all keys are always present
    result = dict(PROFILE_SCHEMA)
    result.update({k: v for k, v in data.items() if k in result})

    # Warn if critical nutrition fields are missing — helps debug silently failing profiles
    critical = ("rmr_kcal", "daily_calorie_goal", "daily_protein_goal_g")
    missing = [f for f in critical if result.get(f) is None]
    if missing:
        logger.warning(
            "generate_profile_map: critical fields are None after merge: %s "
            "(rmr_kcal=%r, daily_calorie_goal=%r, daily_protein_goal_g=%r)",
            missing,
            result.get("rmr_kcal"),
            result.get("daily_calorie_goal"),
            result.get("daily_protein_goal_g"),
        )

    return result
