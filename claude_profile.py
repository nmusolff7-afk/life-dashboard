"""
Claude Opus — user profile generation and Mind tab insights.
"""
import json
import os
import anthropic


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

You have been given a user's answers from a detailed onboarding survey. Your job is to analyze ALL of their responses holistically and fill in a structured 200-variable profile map. This profile will be used to provide deeply personalized health, fitness, nutrition, and life insights.

Guidelines:
- Use the raw inputs to fill every field you can directly derive
- Infer psychological and behavioral traits carefully from how they phrase things, not just what they say
- Calculate physical metrics (BMI, RMR, TDEE, etc.) using standard formulas
- Be honest and nuanced — don't just fill everything positively
- For list fields, output actual JSON arrays
- For score fields (1-10), give genuine assessments
- Leave fields as null only if there is truly no basis to infer them
- The "personalized_insight" should be 2-3 sentences that would make this person feel deeply understood

Physical calculations to use:
- BMI = weight_lbs / height_inches² × 703
- RMR (Mifflin-St Jeor): Men: 10×kg + 6.25×cm − 5×age + 5 | Women: 10×kg + 6.25×cm − 5×age − 161
- If body_fat_pct given, use Katch-McArdle: RMR = 370 + 21.6 × lean_mass_kg
- TDEE multipliers: sedentary×1.2, light×1.375, moderate×1.55, active×1.725, very active×1.9
- Weight loss rate: deficit_kcal / 3500 × 7 = lbs/week

Respond ONLY with a valid JSON object matching the schema keys provided. No markdown, no explanation."""


def generate_profile_map(raw_inputs: dict) -> dict:
    """Run Claude Opus on the collected onboarding data and return filled profile map."""
    schema_keys = list(PROFILE_SCHEMA.keys())
    user_content = f"""USER ONBOARDING RESPONSES:
{json.dumps(raw_inputs, indent=2)}

PROFILE SCHEMA KEYS TO FILL:
{json.dumps(schema_keys)}

Generate the complete profile map JSON now."""

    response = _client().messages.create(
        model="claude-opus-4-6",
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
    return result


MIND_INSIGHTS_PROMPT = """You are an analytical health intelligence system. Given a user's comprehensive profile map, generate a structured set of insights and metrics for their personal dashboard.

Return ONLY a valid JSON object with these exact keys:

{
  "readiness_score": <0-100 integer>,
  "readiness_label": "<Excellent|Good|Fair|Needs Work>",
  "body": {
    "bmi": <number or null>,
    "bmi_category": "<string or null>",
    "rmr": <integer or null>,
    "tdee": <integer or null>,
    "calorie_goal": <integer or null>,
    "protein_goal_g": <integer or null>,
    "lbs_to_goal": <number or null>,
    "weeks_to_goal": <integer or null>,
    "weight_loss_rate": <number or null>
  },
  "scores": [
    {"label": "<label>", "value": <1-10>, "context": "<1 sentence>"},
    ... (6-8 scores total covering energy, stress, sleep, motivation, consistency risk, etc.)
  ],
  "strengths": ["<strength 1>", "<strength 2>", "<strength 3>"],
  "risks": ["<risk 1>", "<risk 2>", "<risk 3>"],
  "top_actions": ["<action 1>", "<action 2>", "<action 3>"],
  "behavioral_archetype": "<2-4 word archetype name>",
  "archetype_description": "<1-2 sentences>",
  "personalized_insight": "<2-3 sentences that feel deeply personal and accurate>",
  "calorie_strategy": "<1 sentence>",
  "macro_strategy": "<1 sentence>",
  "sleep_priority": "<High|Medium|Low>",
  "stress_priority": "<High|Medium|Low>",
  "biggest_leverage_point": "<The single highest-impact change this person could make>"
}"""


def generate_mind_insights(profile_map: dict) -> dict:
    """Generate Mind tab insights from the profile map using Claude Opus."""
    response = _client().messages.create(
        model="claude-opus-4-6",
        max_tokens=2048,
        system=MIND_INSIGHTS_PROMPT,
        messages=[{"role": "user", "content": json.dumps(profile_map)}],
    )
    text = next(b.text for b in response.content if b.type == "text").strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
        text = text.strip()
    return json.loads(text)
