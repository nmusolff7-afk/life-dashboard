"""Deterministic scoring engine — PRD §9 implementation.

Single Python module implementing per-signal normalization, baselines,
category composition, and overall-score roll-up with auto-weighted
graceful degradation (locked decision B2). Response envelopes match
shared/src/types/score.ts so mobile can consume them unchanged.

Design notes:
- No AI anywhere. Pure data reads + math.
- Per B5: category score is null if <3 days of logged data in the
  window. Caller renders a "—" + caption.
- Per B4: population defaults for days 0–13 (no "Calibrating" copy),
  personal 30-day rolling median from day 14+.
- Per B2: Overall auto-redistributes. If Finance is null, Overall is
  an equally-weighted average of the three scored categories.
- Scores stored as 0–100 integers. Signal scores are [0, 1] floats
  internally, turned into integer category scores at the category
  boundary per PRD §9.4.
"""
from __future__ import annotations

import logging
import math
import statistics
from dataclasses import dataclass, field
from datetime import date as _date, timedelta
from typing import Any, Callable, Literal

from db import get_conn

_log = logging.getLogger(__name__)

# ── Constants ───────────────────────────────────────────────────────────

MIN_DAYS_FOR_CATEGORY_SCORE = 3  # locked B5
WARMUP_DAYS = 14                 # PRD §9.6.3
BASELINE_WINDOW_DAYS = 30        # PRD §9.6 — rolling median
BASELINE_MIN_SAMPLES = 10        # ceil(30/3), per PRD §9.6.2

# Score band thresholds (§4.2.9)
BAND_GREEN_MIN = 75
BAND_AMBER_MIN = 50

# Population defaults used during warmup (§9.6.3)
POPULATION_DEFAULTS = {
    "steps":               6000,   # U.S. adult median
    "sleep_hours":         7.5,    # CDC midpoint
    "sleep_start_sd_min":  30,
    "wake_sd_min":         30,
    "daily_pickups":       60,
    "mean_session_min":    3,
    "longest_focus_min":   90,
    "meeting_hours":       3,
    "wake_time_hr":        7.0,
    "first_meal_hr":       8.5,
    "workday_start_hr":    9.0,
    "workday_end_hr":      18.0,
}

# ── Types ───────────────────────────────────────────────────────────────

Band = Literal["green", "amber", "red", "grey"]
Reason = Literal["ok", "insufficient_data", "not_connected", "disabled"]


@dataclass
class Signal:
    name: str
    label: str
    weight: float          # static, pre-redistribution
    score: float | None    # [0, 1] or None if no data
    data_completeness: float  # [0, 1]
    contribution: float = 0.0  # computed downstream

    def as_dict(self) -> dict:
        return {
            "name": self.name,
            "label": self.label,
            "score": self.score,
            "weight": round(self.weight, 2),
            "contribution": round(self.contribution, 2),
            "data_completeness": round(self.data_completeness, 2),
        }


@dataclass
class CategoryResult:
    category: str
    score: int | None
    band: Band
    reason: Reason
    calibrating: bool
    signals: list[Signal]
    subsystems: list[dict] | None = None
    data_completeness_overall: float = 0.0
    sparkline_7d: list[int | None] = field(default_factory=list)
    cta: str | None = None

    def as_dict(self) -> dict:
        out = {
            "category": self.category,
            "score": self.score,
            "band": self.band,
            "reason": self.reason,
            "calibrating": self.calibrating,
            "signals": [s.as_dict() for s in self.signals],
            "data_completeness_overall": round(self.data_completeness_overall, 2),
            "sparkline_7d": self.sparkline_7d,
        }
        if self.subsystems is not None:
            out["subsystems"] = self.subsystems
        if self.cta:
            out["cta"] = self.cta
        return out


# ── Signal normalization ────────────────────────────────────────────────

def piecewise_linear(
    raw: float,
    target: float,
    safe_low: float,
    safe_high: float,
    dmax_low: float,
    dmax_high: float,
) -> float:
    """PRD §9.5.2 — piecewise-linear with safe range.
    Returns score in [0, 1]. Asymmetric via separate low/high bands.
    dmax_low/dmax_high are signed distances beyond the safe range
    where the score reaches 0 (e.g. −500 kcal for calorie deficit).
    Use math.inf on a side that's not penalized.
    """
    delta = raw - target
    if delta >= 0:  # raw is above target
        if delta <= safe_high:
            return 1.0
        if math.isinf(dmax_high):
            return 1.0  # no ceiling penalty
        drop = (delta - safe_high) / (dmax_high - safe_high)
        return max(0.0, 1.0 - drop)
    else:           # raw is below target
        dist = -delta  # positive distance below target
        if dist <= safe_low:
            return 1.0
        if math.isinf(dmax_low):
            return 1.0  # no floor penalty
        drop = (dist - safe_low) / (dmax_low - safe_low)
        return max(0.0, 1.0 - drop)


def band_for_score(score: int | None) -> Band:
    if score is None:
        return "grey"
    if score >= BAND_GREEN_MIN:
        return "green"
    if score >= BAND_AMBER_MIN:
        return "amber"
    return "red"


# ── Baseline helpers ────────────────────────────────────────────────────

def is_warmup(user_id: int, as_of: str) -> bool:
    """True if user is still in the 14-day warmup window."""
    with get_conn() as conn:
        row = conn.execute(
            "SELECT created_at FROM user_onboarding WHERE user_id = ?",
            (user_id,),
        ).fetchone()
    if not row or not row["created_at"]:
        return True
    ob_date = (row["created_at"] or "")[:10]
    try:
        diff = (_date.fromisoformat(as_of) - _date.fromisoformat(ob_date)).days
    except ValueError:
        return True
    return diff < WARMUP_DAYS


def rolling_median(
    samples: list[float], min_samples: int = BASELINE_MIN_SAMPLES,
) -> float | None:
    """Returns median if enough samples, else None."""
    vals = [v for v in samples if v is not None and not math.isnan(v)]
    if len(vals) < min_samples:
        return None
    return float(statistics.median(vals))


def personal_or_population(
    user_id: int, as_of: str, signal_key: str, samples: list[float],
) -> tuple[float, str]:
    """Returns (baseline_value, source). source ∈ {"personal", "population"}."""
    if not is_warmup(user_id, as_of):
        pm = rolling_median(samples)
        if pm is not None:
            return pm, "personal"
    return POPULATION_DEFAULTS[signal_key], "population"


# ── Nutrition ───────────────────────────────────────────────────────────

def _nutrition_signals(user_id: int, as_of: str) -> list[Signal]:
    """Signals per PRD §9.10.2 for nutrition on a given date."""
    with get_conn() as conn:
        goal = conn.execute(
            """
            SELECT calorie_target, protein_g, carbs_g, fat_g
            FROM user_goals WHERE user_id = ?
            """,
            (user_id,),
        ).fetchone()
        today = conn.execute(
            """
            SELECT COALESCE(SUM(calories),  0)  AS cal,
                   COALESCE(SUM(protein_g), 0)  AS prot,
                   COALESCE(SUM(carbs_g),   0)  AS carbs,
                   COALESCE(SUM(fat_g),     0)  AS fat,
                   COUNT(*)                     AS meal_count,
                   MIN(CAST(strftime('%H', logged_at) AS INTEGER)) AS earliest_hr,
                   MAX(CAST(strftime('%H', logged_at) AS INTEGER)) AS latest_hr
            FROM meal_logs
            WHERE user_id = ? AND log_date = ?
            """,
            (user_id, as_of),
        ).fetchone()

    cal_target = float(goal["calorie_target"]) if goal and goal["calorie_target"] else 2000.0
    prot_target = float(goal["protein_g"]) if goal and goal["protein_g"] else 150.0
    carbs_target = float(goal["carbs_g"]) if goal and goal["carbs_g"] else 200.0
    fat_target = float(goal["fat_g"]) if goal and goal["fat_g"] else 65.0

    cal_today = float(today["cal"] or 0)
    prot_today = float(today["prot"] or 0)
    carbs_today = float(today["carbs"] or 0)
    fat_today = float(today["fat"] or 0)
    meal_count = int(today["meal_count"] or 0)

    # Calorie adherence — symmetric ±100 safe, D_max ±500 (§9.10.2)
    cal_score = piecewise_linear(cal_today, cal_target, 100, 100, 500, 500) if meal_count else None
    cal_sig = Signal(
        name="calorie_adherence",
        label="Calorie adherence",
        weight=35.0,
        score=cal_score,
        data_completeness=1.0 if meal_count else 0.0,
    )

    # Protein — floor only. -10g safe low, D_max -60g. Over target always 1.0.
    prot_score = piecewise_linear(prot_today, prot_target, 10, math.inf, 60, math.inf) if meal_count else None
    prot_sig = Signal(
        name="protein_adherence",
        label="Protein adherence",
        weight=25.0,
        score=prot_score,
        data_completeness=1.0 if meal_count else 0.0,
    )

    # Logging consistency — did user log in each meal window?
    # windows: breakfast 5-10, lunch 11-14, dinner 17-21 (PRD §9.10.2)
    # For "today", only count completed windows (based on current hour)
    from datetime import datetime
    now_hr = datetime.now().hour
    windows_expected = sum([now_hr >= 10, now_hr >= 14, now_hr >= 21])
    # Count distinct logged windows by looking at meal_logs' hours
    with get_conn() as conn:
        meal_hrs = [
            r["hr"] for r in conn.execute(
                "SELECT DISTINCT CAST(strftime('%H', logged_at) AS INTEGER) AS hr "
                "FROM meal_logs WHERE user_id = ? AND log_date = ?",
                (user_id, as_of),
            ).fetchall()
        ]
    windows_hit = set()
    for hr in meal_hrs:
        if 5 <= hr <= 10:
            windows_hit.add("b")
        elif 11 <= hr <= 14:
            windows_hit.add("l")
        elif 17 <= hr <= 21:
            windows_hit.add("d")
    if windows_expected > 0:
        log_score = len(windows_hit) / windows_expected
        log_completeness = 1.0
    else:
        log_score = None
        log_completeness = 0.0
    log_sig = Signal(
        name="logging_consistency",
        label="Logging consistency",
        weight=20.0,
        score=min(1.0, log_score) if log_score is not None else None,
        data_completeness=log_completeness,
    )

    # Macro distribution — fat ±10% and carbs ±10%, combined (avg)
    def _macro_subsig(actual: float, target: float) -> float:
        safe = target * 0.10
        dmax = target * 0.30
        return piecewise_linear(actual, target, safe, safe, dmax, dmax)

    if meal_count:
        fat_sub = _macro_subsig(fat_today, fat_target)
        carbs_sub = _macro_subsig(carbs_today, carbs_target)
        macro_score = (fat_sub + carbs_sub) / 2
    else:
        macro_score = None
    macro_sig = Signal(
        name="macro_distribution",
        label="Macro distribution",
        weight=15.0,
        score=macro_score,
        data_completeness=1.0 if meal_count else 0.0,
    )

    # Hydration (weight=5). Phase 7 shipped HydrationCard + log endpoint;
    # daily_activity.hydration_oz now populates for users who opt in. If a
    # user never logs water, data_completeness stays 0 and the B2 weight
    # redistributor pushes the 5 points back to the other signals so the
    # user isn't penalised for a feature they haven't enabled.
    # Per-user goal override is a client-side pref (AsyncStorage) today —
    # server uses the FDA-adjacent 64 oz default for scoring until that
    # pref syncs server-side.
    with get_conn() as conn:
        hydro_row = conn.execute(
            "SELECT hydration_oz FROM daily_activity WHERE user_id = ? AND log_date = ?",
            (user_id, as_of),
        ).fetchone()
    hydro_oz = float(hydro_row["hydration_oz"] or 0) if hydro_row else 0.0
    hydro_goal = 64.0
    if hydro_oz > 0:
        # Safe band ±10% of goal, D_max -50% under (severe dehydration).
        # Over-hydration is not penalised — math.inf on the upside means
        # any value at or above goal scores 1.0.
        hydro_score = piecewise_linear(
            hydro_oz, hydro_goal, hydro_goal * 0.1, math.inf,
            hydro_goal * 0.5, math.inf,
        )
        hydro_completeness = 1.0
    else:
        hydro_score = None
        hydro_completeness = 0.0
    hydration_sig = Signal(
        name="hydration",
        label="Hydration",
        weight=5.0,
        score=hydro_score,
        data_completeness=hydro_completeness,
    )

    return [cal_sig, prot_sig, log_sig, macro_sig, hydration_sig]


# ── Fitness ─────────────────────────────────────────────────────────────

def _fitness_subsystems(user_id: int, as_of: str) -> list[dict]:
    """Fitness has 7 subsystems per PRD §9.10.1. At v1 we compute the
    deterministic ones (Movement / Strength / Body) and return empty/
    stubbed envelopes for HealthKit-dependent ones (Sleep / Recovery /
    Cardio duration / Plan)."""
    subs = []

    # MOVEMENT — steps vs baseline (weight 20)
    # Current steps live in AsyncStorage only, not Flask. Return a null
    # score until Phase 6 wires HealthKit. Signal is excluded — weight
    # will redistribute to Strength / Body / etc. Per PRD §9.7.1.
    movement = {
        "key": "movement",
        "label": "Movement",
        "score": None,
        "band": "grey",
        "weight": 20.0,
        "signals": [
            Signal(
                name="daily_steps",
                label="Daily steps",
                weight=100.0,
                score=None,
                data_completeness=0.0,
            ).as_dict(),
        ],
    }
    subs.append(movement)

    # STRENGTH — weekly volume vs baseline (weight 20)
    from db import strength_weekly_volume
    vol_today = strength_weekly_volume(user_id, as_of, days=7)
    # Historical weekly totals for baseline (30-day rolling median of weekly sums)
    with get_conn() as conn:
        hist_rows = conn.execute(
            """
            SELECT w.log_date AS d, SUM(s.weight_lbs * s.reps) AS v
            FROM strength_sets s
            JOIN workout_logs w ON w.id = s.workout_log_id
            WHERE w.user_id = ? AND w.log_date >= ? AND w.log_date < ?
              AND s.weight_lbs IS NOT NULL
            GROUP BY w.log_date
            """,
            (
                user_id,
                (_date.fromisoformat(as_of) - timedelta(days=BASELINE_WINDOW_DAYS)).isoformat(),
                as_of,
            ),
        ).fetchall()
    # Bucket by 7-day windows ending at as_of, as_of-7, as_of-14, as_of-21
    weekly_totals: list[float] = []
    daily = {r["d"]: float(r["v"] or 0) for r in hist_rows}
    for wk in range(1, 5):
        end = _date.fromisoformat(as_of) - timedelta(days=wk * 7)
        start = end - timedelta(days=6)
        total = sum(v for d, v in daily.items() if start.isoformat() <= d <= end.isoformat())
        if total > 0:
            weekly_totals.append(total)

    if weekly_totals and not is_warmup(user_id, as_of):
        baseline_vol = statistics.median(weekly_totals)
    else:
        baseline_vol = None

    if vol_today > 0 and baseline_vol is not None:
        # Safe range ±25% of baseline, D_max ±50% (derived from PRD §9.10.1 strength signal)
        safe = baseline_vol * 0.25
        dmax = baseline_vol * 0.50
        strength_score = piecewise_linear(vol_today, baseline_vol, safe, safe, dmax, dmax)
        completeness = 1.0
    elif vol_today > 0:
        # Has data but no baseline yet — score against population expectation.
        # Population baseline is hard to defend for strength; per PRD §9.6.3
        # this signal is "excluded during warmup". Emit score=None to
        # redistribute weight.
        strength_score = None
        completeness = 0.5  # we have today's data, just no baseline
    else:
        strength_score = None
        completeness = 0.0

    strength = {
        "key": "strength",
        "label": "Strength",
        "score": None if strength_score is None else round(strength_score * 100),
        "band": band_for_score(None if strength_score is None else round(strength_score * 100)),
        "weight": 20.0,
        "signals": [
            Signal(
                name="weekly_volume",
                label="Weekly volume",
                weight=100.0,
                score=strength_score,
                data_completeness=completeness,
            ).as_dict(),
        ],
    }
    subs.append(strength)

    # BODY — weight trend + 7-day logging consistency (weight 10)
    with get_conn() as conn:
        wt_rows = conn.execute(
            """
            SELECT log_date, weight_lbs FROM daily_activity
            WHERE user_id = ? AND log_date >= ?
              AND weight_lbs IS NOT NULL
            ORDER BY log_date
            """,
            (user_id, (_date.fromisoformat(as_of) - timedelta(days=30)).isoformat()),
        ).fetchall()
        goal = conn.execute(
            "SELECT goal_key FROM user_goals WHERE user_id = ?",
            (user_id,),
        ).fetchone()

    # If the user has NEVER logged weight (no rows in the 30-day window),
    # exclude the Body subsystem entirely so its weight redistributes to
    # the other subsystems instead of dragging Fitness with a 0. A missing
    # signal ≠ a failed signal (PRD §9.7.1).
    if not wt_rows:
        subs.append({
            "key": "body",
            "label": "Body",
            "score": None,
            "band": "grey",
            "weight": 10.0,
            "signals": [
                Signal(name="weight_trend",         label="Weight trend",
                       weight=70.0, score=None, data_completeness=0.0).as_dict(),
                Signal(name="logging_consistency",  label="Logging consistency",
                       weight=30.0, score=None, data_completeness=0.0).as_dict(),
            ],
        })
        for key, label, weight in [
            ("cardio",   "Cardio",   15.0),
            ("sleep",    "Sleep",    15.0),
            ("recovery", "Recovery", 10.0),
            ("plan",     "Plan",     10.0),
        ]:
            subs.append({
                "key": key, "label": label,
                "score": None, "band": "grey", "weight": weight, "signals": [],
            })
        return subs

    # Logging consistency: any weight logged in last 7 days?
    wk_ago = (_date.fromisoformat(as_of) - timedelta(days=7)).isoformat()
    logged_in_week = any(r["log_date"] >= wk_ago for r in wt_rows)
    body_log_score = 1.0 if logged_in_week else 0.0

    # Trend alignment with goal: is the 7-day slope moving in the desired direction?
    goal_key = goal["goal_key"] if goal else "maintain"
    expected_direction = {
        "lose_weight":  -1,
        "build_muscle": +1,
        "recomp":        0,
        "maintain":      0,
    }.get(goal_key, 0)

    body_trend_score = None
    if len(wt_rows) >= 2:
        # Simple: compare latest to oldest in window
        latest = wt_rows[-1]["weight_lbs"]
        oldest = wt_rows[0]["weight_lbs"]
        delta = latest - oldest  # positive = gained, negative = lost
        # Acceptable pace: ~0.5 lb/week for lose/gain; ±0.5 lb total for maintain
        if expected_direction == -1:  # losing
            # delta should be negative; score 1.0 if within -0.3 to -1.5 lb/week pace
            # window is ~7d-30d; normalize to per-week
            days = (
                _date.fromisoformat(wt_rows[-1]["log_date"])
                - _date.fromisoformat(wt_rows[0]["log_date"])
            ).days or 1
            wkly = delta * 7 / days
            body_trend_score = piecewise_linear(wkly, -0.75, 0.75, 0.0, 1.5, 0.75)
        elif expected_direction == +1:  # gaining
            days = (
                _date.fromisoformat(wt_rows[-1]["log_date"])
                - _date.fromisoformat(wt_rows[0]["log_date"])
            ).days or 1
            wkly = delta * 7 / days
            body_trend_score = piecewise_linear(wkly, 0.5, 0.0, 0.5, 0.75, 1.0)
        else:  # maintain / recomp — keep within ±1 lb/week
            days = (
                _date.fromisoformat(wt_rows[-1]["log_date"])
                - _date.fromisoformat(wt_rows[0]["log_date"])
            ).days or 1
            wkly = delta * 7 / days
            body_trend_score = piecewise_linear(wkly, 0.0, 0.5, 0.5, 1.5, 1.5)

    body_signals = [
        Signal(
            name="weight_trend",
            label="Weight trend",
            weight=70.0,
            score=body_trend_score,
            data_completeness=1.0 if len(wt_rows) >= 2 else 0.0,
        ),
        Signal(
            name="logging_consistency",
            label="Logging consistency",
            weight=30.0,
            score=body_log_score,
            data_completeness=1.0,
        ),
    ]
    body_combined = _combine_signals(body_signals)
    subs.append(
        {
            "key": "body",
            "label": "Body",
            "score": None if body_combined is None else round(body_combined * 100),
            "band": band_for_score(None if body_combined is None else round(body_combined * 100)),
            "weight": 10.0,
            "signals": [s.as_dict() for s in body_signals],
        }
    )

    # CARDIO / SLEEP / RECOVERY / PLAN — HealthKit / plan-dependent. Stubbed
    # for Phase 1; will fill in later phases. Their weights redistribute
    # via graceful degradation at the category level.
    for key, label, weight in [
        ("cardio",   "Cardio",   15.0),
        ("sleep",    "Sleep",    15.0),
        ("recovery", "Recovery", 10.0),
        ("plan",     "Plan",     10.0),
    ]:
        subs.append({
            "key": key,
            "label": label,
            "score": None,
            "band": "grey",
            "weight": weight,
            "signals": [],
        })

    return subs


def _combine_signals(signals: list[Signal]) -> float | None:
    """Weighted average over signals with a score. Missing signals are
    dropped and their weight redistributes (PRD §9.7.1). Returns None
    if no signal has data."""
    active = [s for s in signals if s.score is not None]
    if not active:
        return None
    total_weight = sum(s.weight for s in active)
    if total_weight <= 0:
        return None
    weighted = sum(s.score * s.weight for s in active) / total_weight
    for s in signals:
        if s.score is not None:
            s.contribution = (s.score * s.weight / total_weight) * 100
    return weighted


# ── Data-completeness window check (B5) ────────────────────────────────

def _days_logged_in_category(user_id: int, as_of: str, category: str) -> int:
    """Count distinct days with any logging in the given category,
    within the trailing 30 days. Used for the 3-day minimum (B5)."""
    window_start = (_date.fromisoformat(as_of) - timedelta(days=30)).isoformat()
    with get_conn() as conn:
        if category == "nutrition":
            row = conn.execute(
                "SELECT COUNT(DISTINCT log_date) AS n FROM meal_logs "
                "WHERE user_id = ? AND log_date BETWEEN ? AND ?",
                (user_id, window_start, as_of),
            ).fetchone()
        elif category == "fitness":
            row = conn.execute(
                """
                SELECT COUNT(DISTINCT d) AS n FROM (
                    SELECT log_date AS d FROM workout_logs
                    WHERE user_id = ? AND log_date BETWEEN ? AND ?
                    UNION
                    SELECT log_date AS d FROM daily_activity
                    WHERE user_id = ? AND log_date BETWEEN ? AND ?
                      AND weight_lbs IS NOT NULL
                )
                """,
                (user_id, window_start, as_of, user_id, window_start, as_of),
            ).fetchone()
        else:
            return 0
    return int(row["n"] or 0)


# ── Public compute APIs ─────────────────────────────────────────────────

def compute_nutrition_score(user_id: int, as_of: str) -> CategoryResult:
    days = _days_logged_in_category(user_id, as_of, "nutrition")
    signals = _nutrition_signals(user_id, as_of)
    calibrating = is_warmup(user_id, as_of)

    if days < MIN_DAYS_FOR_CATEGORY_SCORE:
        return CategoryResult(
            category="nutrition",
            score=None,
            band="grey",
            reason="insufficient_data",
            calibrating=calibrating,
            signals=signals,
            data_completeness_overall=sum(s.data_completeness for s in signals) / max(1, len(signals)),
            sparkline_7d=_sparkline(user_id, as_of, "nutrition"),
            cta=f"Score available after {MIN_DAYS_FOR_CATEGORY_SCORE} days of logging in Nutrition.",
        )

    combined = _combine_signals(signals)
    score = None if combined is None else round(combined * 100)
    return CategoryResult(
        category="nutrition",
        score=score,
        band=band_for_score(score),
        reason="ok" if score is not None else "insufficient_data",
        calibrating=calibrating,
        signals=signals,
        data_completeness_overall=sum(s.data_completeness for s in signals) / max(1, len(signals)),
        sparkline_7d=_sparkline(user_id, as_of, "nutrition"),
    )


def compute_fitness_score(user_id: int, as_of: str) -> CategoryResult:
    days = _days_logged_in_category(user_id, as_of, "fitness")
    subsystems = _fitness_subsystems(user_id, as_of)
    calibrating = is_warmup(user_id, as_of)

    # Flatten subsystem scores for overall fitness composition.
    active = [s for s in subsystems if s["score"] is not None]
    data_completeness = 0.0
    if subsystems:
        data_completeness = sum(
            (sum(sig["data_completeness"] for sig in s["signals"]) / max(1, len(s["signals"])))
            for s in subsystems
        ) / len(subsystems)

    # We still need to expose signals at the category level for the
    # envelope. Use an empty list — subsystems carry the detail.
    flat_signals: list[Signal] = []

    if days < MIN_DAYS_FOR_CATEGORY_SCORE:
        return CategoryResult(
            category="fitness",
            score=None,
            band="grey",
            reason="insufficient_data",
            calibrating=calibrating,
            signals=flat_signals,
            subsystems=subsystems,
            data_completeness_overall=data_completeness,
            sparkline_7d=_sparkline(user_id, as_of, "fitness"),
            cta=f"Score available after {MIN_DAYS_FOR_CATEGORY_SCORE} days of logging in Fitness.",
        )

    if not active:
        return CategoryResult(
            category="fitness",
            score=None,
            band="grey",
            reason="insufficient_data",
            calibrating=calibrating,
            signals=flat_signals,
            subsystems=subsystems,
            data_completeness_overall=data_completeness,
            sparkline_7d=_sparkline(user_id, as_of, "fitness"),
            cta="Log more fitness activity to activate your Fitness score.",
        )

    total_w = sum(s["weight"] for s in active)
    combined = sum(s["score"] * s["weight"] for s in active) / total_w
    score = round(combined)
    return CategoryResult(
        category="fitness",
        score=score,
        band=band_for_score(score),
        reason="ok",
        calibrating=calibrating,
        signals=flat_signals,
        subsystems=subsystems,
        data_completeness_overall=data_completeness,
        sparkline_7d=_sparkline(user_id, as_of, "fitness"),
    )


def compute_finance_score(user_id: int, as_of: str) -> CategoryResult:
    return CategoryResult(
        category="finance",
        score=None,
        band="grey",
        reason="not_connected",
        calibrating=False,
        signals=[],
        data_completeness_overall=0.0,
        sparkline_7d=[None] * 7,
        cta="Connect your bank to activate Finance.",
    )


def compute_time_score(user_id: int, as_of: str) -> CategoryResult:
    return CategoryResult(
        category="time",
        score=None,
        band="grey",
        reason="not_connected",
        calibrating=False,
        signals=[],
        data_completeness_overall=0.0,
        sparkline_7d=[None] * 7,
        cta="Connect calendar + email to activate Time.",
    )


def compute_overall_score(user_id: int, as_of: str) -> dict:
    """B2 — auto-weighted graceful degradation. If a category is null,
    redistribute its weight equally across the remaining categories.
    If fewer than 2 categories have a score, Overall is null (per PRD
    §9.7.4, the minimum is 2 scored categories)."""
    cats = [
        compute_fitness_score(user_id, as_of),
        compute_nutrition_score(user_id, as_of),
        compute_finance_score(user_id, as_of),
        compute_time_score(user_id, as_of),
    ]

    scored = [c for c in cats if c.score is not None]

    # Build effective_weights: equal share across scored categories; 0 otherwise.
    effective_weights: dict[str, float] = {c.category: 0.0 for c in cats}
    if scored:
        share = 100.0 / len(scored)
        for c in scored:
            effective_weights[c.category] = round(share, 1)

    calibrating = any(c.calibrating for c in scored)

    if len(scored) < 2:
        return {
            "score": None,
            "band": "grey",
            "reason": "insufficient_data",
            "calibrating": calibrating,
            "contributing": [c.category for c in scored],
            "effective_weights": effective_weights,
            "data_completeness_overall": round(
                sum(c.data_completeness_overall for c in cats) / max(1, len(cats)), 2
            ),
            "sparkline_7d": [None] * 7,
            "cta": "Log in at least two categories to see your Overall score.",
        }

    weighted_avg = sum(c.score * effective_weights[c.category] / 100 for c in scored)
    score = round(weighted_avg)

    return {
        "score": score,
        "band": band_for_score(score),
        "reason": "ok",
        "calibrating": calibrating,
        "contributing": [c.category for c in scored],
        "effective_weights": effective_weights,
        "data_completeness_overall": round(
            sum(c.data_completeness_overall for c in cats) / max(1, len(cats)), 2
        ),
        "sparkline_7d": _overall_sparkline(user_id, as_of),
    }


# ── Sparklines ──────────────────────────────────────────────────────────

def _sparkline(user_id: int, as_of: str, category: str) -> list[int | None]:
    """Prior 6 days + today, oldest first. Read from daily_scores cache
    if available, else None. Computed-on-demand on the current day only
    to avoid recursive recomputation cost."""
    today = _date.fromisoformat(as_of)
    dates = [(today - timedelta(days=d)).isoformat() for d in range(6, -1, -1)]
    with get_conn() as conn:
        rows = {
            r["score_date"]: r["score"]
            for r in conn.execute(
                "SELECT score_date, score FROM daily_scores "
                "WHERE user_id = ? AND category = ? AND score_date IN "
                f"({','.join(['?']*len(dates))})",
                (user_id, category, *dates),
            ).fetchall()
        }
    return [rows.get(d) for d in dates]


def _overall_sparkline(user_id: int, as_of: str) -> list[int | None]:
    return _sparkline(user_id, as_of, "overall")


# ── Caching + persistence ──────────────────────────────────────────────

def snapshot_scores(user_id: int, as_of: str) -> None:
    """Write today's category + overall scores to daily_scores.
    Idempotent (upsert). Called by the nightly cron and by the endpoint
    on read if today's row is stale."""
    import json as _json
    from datetime import datetime as _dt

    now = _dt.now().isoformat()
    fitness = compute_fitness_score(user_id, as_of).as_dict()
    nutrition = compute_nutrition_score(user_id, as_of).as_dict()
    overall = compute_overall_score(user_id, as_of)

    rows = [
        ("fitness",   fitness["score"], fitness["band"], 1 if fitness["calibrating"] else 0,
            _json.dumps(fitness["signals"]), fitness["data_completeness_overall"]),
        ("nutrition", nutrition["score"], nutrition["band"], 1 if nutrition["calibrating"] else 0,
            _json.dumps(nutrition["signals"]), nutrition["data_completeness_overall"]),
        ("finance", None, "grey", 0, "[]", 0.0),
        ("time",    None, "grey", 0, "[]", 0.0),
        ("overall",  overall["score"], overall["band"], 1 if overall["calibrating"] else 0,
            _json.dumps([]), overall["data_completeness_overall"]),
    ]

    with get_conn() as conn:
        for cat, score, band, cal, signals_json, completeness in rows:
            conn.execute(
                """
                INSERT INTO daily_scores
                  (user_id, score_date, category, score, band, calibrating,
                   signals_json, data_completeness, computed_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(user_id, score_date, category) DO UPDATE SET
                  score = excluded.score,
                  band  = excluded.band,
                  calibrating = excluded.calibrating,
                  signals_json = excluded.signals_json,
                  data_completeness = excluded.data_completeness,
                  computed_at = excluded.computed_at
                """,
                (user_id, as_of, cat, score, band, cal, signals_json, completeness, now),
            )
        conn.commit()
