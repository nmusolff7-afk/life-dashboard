"""
Goal architecture — the single source of truth for all goal-driven calculations.

Every number here traces to peer-reviewed research. Nothing is AI-generated.
The frontend JS has copies of the multipliers (GOAL_CAL_ADJ, GOAL_PRO_GPERKG)
for live preview — those MUST stay in sync with this file.
"""

# ── The four supported goals ────────────────────────────────────────────────

GOAL_CONFIGS = {
    "lose_weight": {
        "key":          "lose_weight",
        "label":        "Lose Weight",
        "short":        "Cut",
        "cal_adjust":   -0.20,      # TDEE × (1 + adjust)
        "protein_gkg":  2.0,        # grams per kg of reference weight
        "protein_ref":  "goal",     # use goal weight when goal_wt < current_wt
        "fat_pct":      0.25,       # 25% of target calories
        "fat_floor_gkg": 0.7,       # minimum g/kg body weight
        "carb_min_g":   100,        # absolute floor
        "description":  "Calorie deficit to lose body fat while preserving muscle mass.",
        "rationale": {
            "calories": (
                "A 20% deficit below TDEE is the standard moderate cut — aggressive enough "
                "to produce ~0.5–1% body weight loss per week, conservative enough to "
                "preserve lean mass and sustain adherence. Target never drops below RMR."
            ),
            "protein": (
                "2.0 g/kg, mid-range of the 1.8–2.4 g/kg window shown to preserve lean "
                "mass during caloric restriction. Uses goal weight as reference when goal "
                "weight is below current weight, since that reflects the body composition "
                "you're building toward."
            ),
            "fat": (
                "25% of target calories or 0.7 g/kg body weight, whichever is higher. "
                "The floor protects hormone production (testosterone, estrogen) and "
                "fat-soluble vitamin absorption."
            ),
            "carbs": (
                "Remainder after protein and fat, minimum 100g/day to support brain "
                "function and training intensity."
            ),
        },
        "sources": [
            "Helms et al. (2014) J Int Soc Sports Nutr — protein during caloric restriction",
            "Mifflin et al. (1990) Am J Clin Nutr — RMR estimation",
            "Katch & McArdle (1996) — RMR from lean body mass",
        ],
    },

    "build_muscle": {
        "key":          "build_muscle",
        "label":        "Build Muscle",
        "short":        "Bulk",
        "cal_adjust":   0.10,
        "protein_gkg":  1.8,
        "protein_ref":  "current",  # use current body weight
        "fat_pct":      0.25,
        "fat_floor_gkg": 0.7,
        "carb_min_g":   100,
        "description":  "Calorie surplus to maximize muscle protein synthesis and strength gains.",
        "rationale": {
            "calories": (
                "A 10% surplus above TDEE provides the energy needed for muscle growth "
                "without excessive fat gain. Larger surpluses don't accelerate muscle "
                "growth — they just add more fat."
            ),
            "protein": (
                "1.8 g/kg — lower than the cut because a caloric surplus is inherently "
                "anabolic (higher insulin, lower cortisol, reduced amino acid oxidation). "
                "Morton et al. 2018 found diminishing returns above ~1.6 g/kg in a "
                "surplus; 1.8 provides a comfortable margin. Extra calories are better "
                "spent on carbs to fuel training intensity."
            ),
            "fat": (
                "25% of target calories or 0.7 g/kg body weight, whichever is higher."
            ),
            "carbs": (
                "Remainder after protein and fat. In a surplus, carbs are the primary "
                "driver of training performance and glycogen replenishment."
            ),
        },
        "sources": [
            "Morton et al. (2018) Br J Sports Med — protein dose-response for hypertrophy",
            "Iraki et al. (2019) J Int Soc Sports Nutr — nutrition for bodybuilding",
        ],
    },

    "recomp": {
        "key":          "recomp",
        "label":        "Body Recomposition",
        "short":        "Recomp",
        "cal_adjust":   -0.10,
        "protein_gkg":  2.2,
        "protein_ref":  "current",
        "fat_pct":      0.25,
        "fat_floor_gkg": 0.7,
        "carb_min_g":   100,
        "description":  "Lose fat and build muscle simultaneously with a mild deficit and high protein.",
        "rationale": {
            "calories": (
                "A mild 10% deficit — enough to mobilize fat stores, small enough to "
                "still support muscle protein synthesis. Recomp is the slowest path but "
                "avoids distinct bulk/cut phases."
            ),
            "protein": (
                "2.2 g/kg — the highest of all four goals. You're asking your body to do "
                "two opposing things (build muscle while losing fat), which demands "
                "maximum protein to fuel synthesis under catabolic pressure. The mild "
                "deficit means less total food, so protein must make up a larger share."
            ),
            "fat": (
                "25% of target calories or 0.7 g/kg body weight, whichever is higher."
            ),
            "carbs": (
                "Remainder after protein and fat, minimum 100g/day. Lower than a bulk "
                "due to the mild deficit, but still enough to support training."
            ),
        },
        "sources": [
            "Barakat et al. (2020) Strength Cond J — body recomposition evidence review",
            "Helms et al. (2014) J Int Soc Sports Nutr — high protein in deficit",
        ],
    },

    "maintain": {
        "key":          "maintain",
        "label":        "Maintain",
        "short":        "Maintain",
        "cal_adjust":   0.0,
        "protein_gkg":  1.6,
        "protein_ref":  "current",
        "fat_pct":      0.25,
        "fat_floor_gkg": 0.7,
        "carb_min_g":   100,
        "description":  "Eat at maintenance to hold current weight and body composition.",
        "rationale": {
            "calories": (
                "No adjustment — eating at TDEE to maintain current weight. Ideal for "
                "periods between dedicated cut/bulk phases or for long-term sustainability."
            ),
            "protein": (
                "1.6 g/kg — roughly double the RDA (0.8 g/kg, which is set to prevent "
                "deficiency, not optimize). Sufficient to maintain existing muscle mass "
                "and support daily protein turnover without overprioritizing protein at "
                "the expense of diet flexibility."
            ),
            "fat": (
                "25% of target calories or 0.7 g/kg body weight, whichever is higher."
            ),
            "carbs": (
                "Remainder after protein and fat. At maintenance, carb intake is flexible "
                "and supports training volume and daily energy."
            ),
        },
        "sources": [
            "Phillips & Van Loon (2011) J Sports Sci — dietary protein for athletes",
            "Jäger et al. (2017) J Int Soc Sports Nutr — ISSN position stand on protein",
        ],
    },
}

# Ordered list of valid goal keys
VALID_GOALS = list(GOAL_CONFIGS.keys())


def get_goal_config(goal_key: str) -> dict:
    """Return the config dict for a goal, or the lose_weight default."""
    return GOAL_CONFIGS.get(goal_key, GOAL_CONFIGS["lose_weight"])


def compute_targets(goal_key: str, weight_lbs: float, target_weight_lbs: float,
                    height_ft: int, height_in: int, age: int, sex: str,
                    bf_pct: float = 0, tdee: int = 0) -> dict:
    """Compute calorie and macro targets from body stats and goal.

    Args:
        tdee: If 0, computes RMR only (no NEAT/EAT/TEF). Pass full TDEE
              if available for a more accurate calorie target.

    Returns dict with: goal_key, rmr, tdee_used, calorie_target, protein_g,
    fat_g, carbs_g, deficit_surplus, and the config/sources used.
    """
    cfg = get_goal_config(goal_key)

    # ── RMR ──
    kg = weight_lbs * 0.453592
    cm = (height_ft * 12 + height_in) * 2.54

    if bf_pct and 0 < bf_pct < 100:
        lbm_kg = kg * (1 - bf_pct / 100)
        rmr = round(370 + 21.6 * lbm_kg)
        rmr_method = "katch_mcardle"
    else:
        base = 10 * kg + 6.25 * cm - 5 * age
        rmr = round(base + 5 if sex == "male" else base - 161)
        rmr_method = "mifflin_st_jeor"

    # ── Calorie target ──
    tdee_used = tdee if tdee > 0 else rmr
    raw_target = round(tdee_used * (1 + cfg["cal_adjust"]))
    calorie_target = max(raw_target, rmr)  # never below RMR

    # ── Protein ──
    if cfg["protein_ref"] == "goal" and target_weight_lbs < weight_lbs:
        ref_kg = target_weight_lbs * 0.453592
    else:
        ref_kg = kg
    protein_g = round(ref_kg * cfg["protein_gkg"])

    # ── Fat ──
    fat_from_pct = round((calorie_target * cfg["fat_pct"]) / 9)
    fat_from_bw = round(kg * cfg["fat_floor_gkg"])
    fat_g = max(fat_from_pct, fat_from_bw)

    # ── Carbs ──
    remaining = calorie_target - protein_g * 4 - fat_g * 9
    carbs_g = max(cfg["carb_min_g"], round(remaining / 4))

    return {
        "goal_key":        goal_key,
        "goal_label":      cfg["label"],
        "rmr":             rmr,
        "rmr_method":      rmr_method,
        "tdee_used":       tdee_used,
        "calorie_target":  calorie_target,
        "cal_adjust_pct":  cfg["cal_adjust"],
        "deficit_surplus":  calorie_target - tdee_used,  # negative = deficit
        "protein_g":       protein_g,
        "protein_gkg":     cfg["protein_gkg"],
        "protein_ref":     cfg["protein_ref"],
        "fat_g":           fat_g,
        "fat_pct":         cfg["fat_pct"],
        "fat_floor_gkg":   cfg["fat_floor_gkg"],
        "carbs_g":         carbs_g,
        "carb_min_g":      cfg["carb_min_g"],
        "sources":         cfg["sources"],
        "rationale":       cfg["rationale"],
    }
