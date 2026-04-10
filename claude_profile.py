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
- Leave fields as null only if there is no data to derive them from

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
        model="claude-haiku-4-5-20251001",
        max_tokens=1024,
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


# ── Evening prompt generation ────────────────────────────────────────────────

def generate_evening_prompt(goals: str, notes: str, summary: str) -> str | None:
    """Generate one adaptive follow-up question for the evening debrief based on morning content."""
    parts = []
    if goals   and goals.strip():   parts.append(f"Goals: {goals.strip()}")
    if notes   and notes.strip():   parts.append(f"Notes: {notes.strip()}")
    if summary and summary.strip(): parts.append(f"Summary: {summary.strip()}")
    if not parts:
        return None
    try:
        msg = _client().messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=80,
            messages=[{"role": "user", "content": (
                "Based on this morning check-in, write ONE short follow-up question for the "
                "evening debrief. Reference something specific they mentioned — a goal, plan, "
                "or concern. Be direct and conversational. Return only the question, nothing else.\n\n"
                + "\n".join(parts)
            )}],
        )
        return next(b.text for b in msg.content if b.type == "text").strip()
    except Exception:
        return None


# ── Daily brief / debrief scoring ────────────────────────────────────────────

def score_brief(brief_type: str, notes: str, goals: str) -> dict:
    """Score a brief and extract explicitly stated tasks via Claude Haiku."""
    import re
    goals_line = f"Goals: {goals.strip()}\n" if goals.strip() else ""
    prompt = (
        f"Analyze this {brief_type} check-in. Return ONLY valid JSON with these exact keys:\n"
        f'- "focus": integer 1-10 (goal clarity, motivation, mental sharpness)\n'
        f'- "wellbeing": integer 1-10 (mood, energy, stress — higher is better)\n'
        f'- "summary": string under 15 words capturing the key takeaway\n'
        f'- "tasks": array of CONCRETE actionable tasks only. STRICT RULES:\n'
        f'  1. Only include items the user EXPLICITLY stated as a specific thing they need to DO (e.g. "I need to finish the report", "I have to call the dentist").\n'
        f'  2. DO NOT include goals, aspirations, intentions, or desires (e.g. "I want to eat healthier", "hoping to be more productive", "goal is to sleep better").\n'
        f'  3. DO NOT include habits, lifestyle advice, or anything implied by context.\n'
        f'  4. DO NOT infer or suggest tasks — even if they seem obvious or helpful.\n'
        f'  5. A task must be completable in a single action or session — not an ongoing goal.\n'
        f'  6. Copy the user\'s wording closely. If the user said nothing they explicitly need to do, return an empty array.\n'
        f'  Max 10 tasks.\n\n'
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
