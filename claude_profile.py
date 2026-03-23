"""
Claude Opus — user profile generation and Mind tab insights.
"""
import json
import logging
import os
import anthropic

logger = logging.getLogger(__name__)


def _client():
    return anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])


# ── 200-variable schema (all keys, all None by default) ──────────────────────

PROFILE_SCHEMA = {
    # Identity
    "first_name": None, "age": None, "date_of_birth": None,
    "gender": None, "pronouns": None,
    # Physical body
    "height_inches": None, "height_ft": None, "height_in": None,
    "current_weight_lbs": None, "target_weight_lbs": None,
    "body_fat_pct": None, "bmi": None,
    "lean_mass_lbs": None, "fat_mass_lbs": None,
    "rmr_kcal": None, "tdee_kcal": None,
    "daily_calorie_goal": None, "daily_protein_goal_g": None,
    "daily_carbs_goal_g": None, "daily_fat_goal_g": None,
    "calorie_deficit_target": None, "weight_loss_rate_lbs_per_week": None,
    "weeks_to_goal": None, "lbs_to_goal": None,
    # Goals & motivation
    "primary_goal": None, "goal_timeline_weeks": None,
    "goal_why_raw": None, "goal_why_core_motivation": None,
    "goal_urgency_1_10": None, "goal_confidence_1_10": None,
    "goal_previous_attempts_raw": None, "goal_previous_attempt_summary": None,
    "typical_obstacles_raw": None, "obstacle_categories": None,
    "success_vision_1yr_raw": None, "success_vision_summary": None,
    "secondary_goals": None, "life_priorities": None,
    "values_inferred": None,
    # Lifestyle
    "occupation_type": None, "occupation_description": None,
    "work_hours_per_week": None, "commute_type": None,
    "commute_minutes_per_day": None, "sleep_hours_per_night": None,
    "sleep_quality_1_10": None, "chronotype": None,
    "stress_level_1_10": None, "stress_main_source": None,
    "screen_time_hours_per_day": None,
    "social_energy": None, "living_situation": None,
    "has_children": None, "relationship_status": None,
    "hobbies_raw": None, "hobbies_list": None,
    # Nutrition
    "diet_type": None, "dietary_restrictions": None,
    "food_allergies": None, "foods_loved_raw": None,
    "foods_loved_list": None, "foods_disliked_raw": None,
    "foods_disliked_list": None,
    "cook_vs_eat_out_ratio_0_10": None, "meal_prep_habit": None,
    "breakfast_habit": None, "meal_timing_preference": None,
    "meal_frequency_per_day": None,
    "hydration_glasses_per_day": None,
    "alcohol_frequency": None, "alcohol_drinks_per_week": None,
    "caffeine_cups_per_day": None, "supplement_use_raw": None,
    "supplement_list": None, "intermittent_fasting": None,
    # Fitness
    "workout_days_per_week": None, "workout_types_enjoyed": None,
    "fitness_experience_level": None,
    "activity_level_outside_gym": None,
    "current_cardio_description": None, "current_strength_description": None,
    "workout_time_preference": None, "workout_duration_minutes": None,
    "sport_activities": None, "fitness_injuries_limitations": None,
    "steps_per_day_estimated": None, "vo2max_estimated": None,
    # Mental & psychological
    "energy_level_typical_1_10": None, "mood_baseline_1_10": None,
    "anxiety_level_1_10": None, "mindfulness_practice": None,
    "mindfulness_type": None, "journaling_habit": None,
    "motivation_style": None, "accountability_preference": None,
    "personality_inferred": None, "growth_mindset_score_1_10": None,
    "self_efficacy_score_1_10": None,
    "resilience_indicators": None, "risk_factors": None,
    "perfectionism_tendency": None, "all_or_nothing_thinking": None,
    # Health
    "medical_conditions_raw": None, "medications_raw": None,
    "chronic_pain_areas": None, "mental_health_history_raw": None,
    "family_health_history_raw": None, "last_physical_exam_approx": None,
    "smoking_status": None, "recreational_substances": None,
    "hormonal_considerations": None, "gut_health_notes": None,
    # Financial
    "financial_goals_raw": None, "financial_goals_summary": None,
    "income_bracket": None, "financial_stress_level_1_10": None,
    "financial_health_impact": None,
    # Data connections
    "willing_to_connect_gmail": None, "willing_to_connect_sms": None,
    "willing_to_connect_banking": None, "willing_to_connect_wearable": None,
    "current_wearable": None, "wearable_brand": None,
    "data_sharing_comfort_level": None,
    # App usage intent
    "primary_app_use_case": None, "check_in_frequency_preference": None,
    "notification_preference": None, "coaching_style_preference": None,
    # AI-generated profile insights
    "readiness_score_0_100": None,
    "biggest_leverage_point": None,
    "predicted_success_timeline": None,
    "personalized_approach": None,
    "calorie_strategy": None, "macro_strategy": None,
    "workout_recommendation": None,
    "sleep_priority": None, "stress_management_need": None,
    "key_risks": None, "key_strengths": None,
    "personalized_insight": None,
    "behavioral_archetype": None,
    "engagement_prediction": None,
    "top_3_action_items": None,
    "one_sentence_summary": None,
    # Onboarding meta
    "onboarding_version": "1.0",
    "profile_generated_at": None,
}


PROFILE_GENERATION_PROMPT = """You are a world-class personal health and life coach generating a comprehensive user profile.

You have been given a user's answers from a detailed onboarding survey. Analyze ALL responses holistically and fill in a structured profile map. This profile powers deeply personalized health, fitness, nutrition, and life insights.

Guidelines:
- Use raw inputs to fill every field you can directly derive
- Infer psychological and behavioral traits from how they phrase things, not just what they say
- Calculate physical metrics (BMI, RMR, TDEE, etc.) using standard formulas
- Be honest and nuanced — don't fill everything positively
- For list fields, output actual JSON arrays
- For score fields (1-10), give genuine assessments
- Leave fields as null only if there is truly no basis to infer them
- The "personalized_insight" should be 2-3 sentences that make this person feel deeply understood

Respond ONLY with a valid JSON object. No markdown, no explanation."""


def generate_profile_map(raw_inputs: dict) -> dict:
    """Run Claude Sonnet on the collected onboarding data and return filled profile map."""
    schema_keys = json.dumps(list(PROFILE_SCHEMA.keys()), indent=2)
    user_content = (
        f"USER ONBOARDING RESPONSES:\n{json.dumps(raw_inputs)}\n\n"
        f"EXACT JSON KEYS YOU MUST USE (use these exact key names, no others):\n{schema_keys}\n\n"
        f"Generate the complete profile map JSON now using ONLY the keys listed above."
    )

    response = _client().messages.create(
        model="claude-sonnet-4-6",
        max_tokens=4096,
        system=PROFILE_GENERATION_PROMPT,
        messages=[{"role": "user", "content": user_content}],
    )
    text = next(b.text for b in response.content if b.type == "text").strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
        text = text.strip()
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


def compute_mind_insights(profile_map: dict) -> dict:
    """Derive Mind tab insights from the stored profile_map — no API call needed."""
    p = profile_map or {}

    def _num(key, default=5):
        """Safely coerce a profile field to float, falling back to default."""
        v = p.get(key)
        try:
            return float(v)
        except (TypeError, ValueError):
            return float(default)

    def _priority(score, high_thresh, low_thresh, inverted=False):
        """Convert a 1-10 score to High/Medium/Low priority string."""
        v = score if not inverted else (10 - score)
        if v >= high_thresh:
            return "High"
        if v <= low_thresh:
            return "Low"
        return "Medium"

    def _bmi_category(bmi):
        if bmi is None:
            return None
        b = float(bmi)
        if b < 18.5:
            return "Underweight"
        if b < 25:
            return "Normal"
        if b < 30:
            return "Overweight"
        return "Obese"

    # ── Subscores (all normalised to 0-100) ───────────────────────────────────
    energy     = _num("energy_level_typical_1_10") * 10          # higher = better
    sleep      = _num("sleep_quality_1_10") * 10                  # higher = better
    stress_inv = (10 - _num("stress_level_1_10")) * 10            # lower stress = better
    motivation = (_num("goal_urgency_1_10") + _num("goal_confidence_1_10")) / 2 * 10
    mindset    = (_num("growth_mindset_score_1_10") + _num("self_efficacy_score_1_10")) / 2 * 10
    mood       = _num("mood_baseline_1_10") * 10                  # higher = better
    anxiety_inv= (10 - _num("anxiety_level_1_10")) * 10           # lower anxiety = better

    # Weighted readiness score
    readiness = int(round(
        energy     * 0.15 +
        sleep      * 0.15 +
        stress_inv * 0.15 +
        motivation * 0.20 +
        mindset    * 0.15 +
        mood       * 0.10 +
        anxiety_inv* 0.10
    ))
    readiness = max(0, min(100, readiness))

    if readiness >= 80:
        label = "Excellent"
    elif readiness >= 60:
        label = "Good"
    elif readiness >= 40:
        label = "Fair"
    else:
        label = "Needs Work"

    # ── Body metrics ─────────────────────────────────────────────────────────
    raw_bmi = p.get("bmi")
    try:
        bmi_val = round(float(raw_bmi), 1)
    except (TypeError, ValueError):
        bmi_val = None

    body = {
        "bmi":              bmi_val,
        "bmi_category":     _bmi_category(bmi_val),
        "rmr":              p.get("rmr_kcal"),
        "tdee":             p.get("tdee_kcal"),
        "calorie_goal":     p.get("daily_calorie_goal"),
        "protein_goal_g":   p.get("daily_protein_goal_g"),
        "lbs_to_goal":      p.get("lbs_to_goal"),
        "weeks_to_goal":    p.get("weeks_to_goal"),
        "weight_loss_rate": p.get("weight_loss_rate_lbs_per_week"),
    }

    # ── Wellness scores array ────────────────────────────────────────────────
    def _score_context(label, val):
        """Generate a one-line context string from a score value."""
        if val >= 8:
            return f"{label} is a clear strength — keep it up."
        if val >= 6:
            return f"{label} is solid with room to grow."
        if val >= 4:
            return f"{label} is moderate — worth attention."
        return f"{label} is a priority area to address."

    raw_consistency = 10 - (
        (_num("perfectionism_tendency", 5) + _num("all_or_nothing_thinking", 5)) / 2
    )

    scores = [
        {"label": "Energy",       "value": round(_num("energy_level_typical_1_10")),   "context": _score_context("Energy", _num("energy_level_typical_1_10"))},
        {"label": "Sleep",        "value": round(_num("sleep_quality_1_10")),           "context": _score_context("Sleep quality", _num("sleep_quality_1_10"))},
        {"label": "Stress",       "value": round(10 - _num("stress_level_1_10")),       "context": _score_context("Stress resilience", 10 - _num("stress_level_1_10"))},
        {"label": "Motivation",   "value": round((_num("goal_urgency_1_10") + _num("goal_confidence_1_10")) / 2), "context": _score_context("Motivation", (_num("goal_urgency_1_10") + _num("goal_confidence_1_10")) / 2)},
        {"label": "Mindset",      "value": round((_num("growth_mindset_score_1_10") + _num("self_efficacy_score_1_10")) / 2), "context": _score_context("Mindset", (_num("growth_mindset_score_1_10") + _num("self_efficacy_score_1_10")) / 2)},
        {"label": "Mood",         "value": round(_num("mood_baseline_1_10")),           "context": _score_context("Mood baseline", _num("mood_baseline_1_10"))},
        {"label": "Consistency",  "value": round(raw_consistency),                      "context": _score_context("Consistency risk", raw_consistency)},
    ]

    # ── Priorities ────────────────────────────────────────────────────────────
    sleep_priority  = _priority(_num("sleep_quality_1_10"),  high_thresh=7.5, low_thresh=5, inverted=True)  # low sleep quality = high priority
    stress_priority = _priority(_num("stress_level_1_10"),   high_thresh=7,   low_thresh=4)                 # high stress = high priority

    # ── Text fields — read directly from profile_map ──────────────────────────
    strengths = p.get("key_strengths") or []
    if isinstance(strengths, str):
        try:
            strengths = json.loads(strengths)
        except Exception:
            strengths = [strengths]

    risks = p.get("key_risks") or []
    if isinstance(risks, str):
        try:
            risks = json.loads(risks)
        except Exception:
            risks = [risks]

    top_actions = p.get("top_3_action_items") or []
    if isinstance(top_actions, str):
        try:
            top_actions = json.loads(top_actions)
        except Exception:
            top_actions = [top_actions]

    # ── Calorie / macro strategy strings ─────────────────────────────────────
    cal_goal  = body["calorie_goal"]
    prot_goal = body["protein_goal_g"]
    calorie_strategy = p.get("calorie_strategy") or (
        f"Target {cal_goal} kcal/day to support your goal." if cal_goal else None
    )
    macro_strategy = p.get("macro_strategy") or (
        f"Aim for {prot_goal}g protein daily to preserve lean mass." if prot_goal else None
    )

    return {
        "readiness_score":      readiness,
        "readiness_label":      label,
        "body":                 body,
        "scores":               scores,
        "strengths":            strengths,
        "risks":                risks,
        "top_actions":          top_actions,
        "behavioral_archetype": p.get("behavioral_archetype"),
        "archetype_description":p.get("personalized_approach"),
        "personalized_insight": p.get("personalized_insight"),
        "calorie_strategy":     calorie_strategy,
        "macro_strategy":       macro_strategy,
        "sleep_priority":       sleep_priority,
        "stress_priority":      stress_priority,
        "biggest_leverage_point": p.get("biggest_leverage_point"),
    }


# ── Daily brief / debrief scoring ────────────────────────────────────────────

def score_brief(brief_type: str, notes: str, goals: str) -> dict:
    """Score a brief and extract actionable tasks via Claude Haiku."""
    import re
    goals_line = f"Goals: {goals.strip()}\n" if goals.strip() else ""
    prompt = (
        f"Analyze this {brief_type} check-in. Return ONLY valid JSON with these exact keys:\n"
        f'- "focus": integer 1-10 (goal clarity, motivation, mental sharpness)\n'
        f'- "wellbeing": integer 1-10 (mood, energy, stress — higher is better)\n'
        f'- "summary": string under 15 words capturing the key takeaway\n'
        f'- "tasks": array of short, distinct, actionable task strings extracted from the text '
        f'(things the person wants or needs to do — make them clear and checkable, max 10)\n\n'
        f"{goals_line}Notes: {notes.strip()}\n\nReturn JSON only, no other text:"
    )
    try:
        msg = _client().messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=400,
            messages=[{"role": "user", "content": prompt}],
        )
        text = msg.content[0].text.strip()
        match = re.search(r'\{.*\}', text, re.DOTALL)
        if match:
            data = json.loads(match.group())
            return {
                "focus":     max(1, min(10, int(data.get("focus", 5)))),
                "wellbeing": max(1, min(10, int(data.get("wellbeing", 5)))),
                "summary":   str(data.get("summary", "Check-in recorded."))[:100],
                "tasks":     [str(t).strip()[:120] for t in (data.get("tasks") or []) if str(t).strip()][:10],
            }
    except Exception:
        pass
    return {"focus": 5, "wellbeing": 5, "summary": "Check-in recorded.", "tasks": []}
