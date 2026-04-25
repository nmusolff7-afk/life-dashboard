"""Goals progress + pace calculation engine.

Per PRD §4.10.5 (progress) and §4.10.6 (pace).

Two entry points:
- `compute_goal_progress(goal, user_id)` reads underlying data tables,
  returns a dict of updated fields (to be passed into
  db.update_goal_progress). Also returns a `paused` flag if the goal's
  data source isn't available — callers use this to mark a goal paused
  (PRD §4.10.5 'When current data is unavailable').
- `compute_pace(goal)` is pure-shape: just returns the display indicator
  given the goal's current state. No DB reads.

Per library_id dispatch for progress. Easy to extend when new library
entries land.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any

from db import get_conn


# ── Progress ──────────────────────────────────────────────────────────────


def compute_goal_progress(goal: dict, user_id: int) -> dict:
    """Compute current state for one goal.

    Returns:
        {
            'current_fields': dict,         # to pass to db.update_goal_progress
            'progress_pct': float | None,   # 0..1 for display / snapshot
            'snapshot_value': float | None, # raw current value for snapshot
            'paused': bool,                 # True if data source unavailable
            'completed': bool,              # True if this run flipped goal to done
        }
    """
    library_id = goal.get("library_id")
    # Per-library dispatch. Falling through to 'paused' for library_ids we
    # haven't wired a data source for yet (FIN-*, TIME-02..06, NUT-05).
    handler = _PROGRESS_HANDLERS.get(library_id, _paused_handler)
    return handler(goal, user_id)


def _paused_handler(goal: dict, user_id: int) -> dict:
    """Default for goals whose data source isn't available yet."""
    return {
        "current_fields": {},
        "progress_pct": None,
        "snapshot_value": None,
        "paused": True,
        "completed": False,
    }


# --- FIT-01: Reach goal weight (cumulative_numeric) ---

def _progress_weight(goal: dict, user_id: int) -> dict:
    start = goal.get("start_value")
    target = goal.get("target_value")
    direction = goal.get("direction")
    current = _latest_weight_lbs(user_id)
    if current is None:
        return {
            "current_fields": {},
            "progress_pct": None, "snapshot_value": None,
            "paused": True, "completed": False,
        }
    pct = _cumulative_pct(start, target, current, direction)
    completed = pct is not None and pct >= 1.0
    return {
        "current_fields": {"current_value": current},
        "progress_pct": pct,
        "snapshot_value": current,
        "paused": False,
        "completed": completed,
    }


def _latest_weight_lbs(user_id: int) -> float | None:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT weight_lbs FROM daily_activity "
            "WHERE user_id = ? AND weight_lbs IS NOT NULL "
            "ORDER BY log_date DESC LIMIT 1",
            (user_id,),
        ).fetchone()
    return float(row["weight_lbs"]) if row and row["weight_lbs"] is not None else None


# --- FIT-02/03/04: Strength PRs (best_attempt) ---

def _progress_strength_pr(lift_keyword: str):
    def inner(goal: dict, user_id: int) -> dict:
        baseline = goal.get("baseline_value")
        target = goal.get("target_value")
        direction = goal.get("direction") or "increase"
        best = _best_strength_lift(user_id, lift_keyword)
        if best is None:
            # No strength data yet — goal not paused (data source is
            # reachable, it just has nothing in it), but progress stays
            # None until the user logs.
            return {
                "current_fields": {},
                "progress_pct": None, "snapshot_value": None,
                "paused": False, "completed": False,
            }
        pct = _best_attempt_pct(baseline, target, best, direction)
        completed = (
            target is not None and (
                (direction == "increase" and best >= target)
                or (direction == "decrease" and best <= target)
            )
        )
        return {
            "current_fields": {"best_attempt_value": best},
            "progress_pct": pct,
            "snapshot_value": best,
            "paused": False,
            "completed": bool(completed),
        }
    return inner


def _best_strength_lift(user_id: int, keyword: str) -> float | None:
    """Max weight for any set on an exercise whose name matches `keyword`
    (case-insensitive). Intentionally simple — treats heaviest lifted set
    as the PR regardless of reps, which matches how most lifters use the
    metric colloquially. A true e1RM calc is post-v1."""
    like = f"%{keyword.lower()}%"
    with get_conn() as conn:
        row = conn.execute(
            "SELECT MAX(weight_lbs) AS pr FROM strength_sets s "
            "JOIN workout_logs w ON s.workout_log_id = w.id "
            "WHERE w.user_id = ? AND lower(s.exercise_name) LIKE ? "
            "AND s.weight_lbs IS NOT NULL",
            (user_id, like),
        ).fetchone()
    return float(row["pr"]) if row and row["pr"] is not None else None


# --- FIT-05: Workouts this month (period_count) ---

def _progress_workouts_period(goal: dict, user_id: int) -> dict:
    period_start = goal.get("period_start")
    period_end = goal.get("period_end")
    target = goal.get("target_count")
    if not (period_start and period_end and target):
        return _paused_handler(goal, user_id)
    with get_conn() as conn:
        row = conn.execute(
            "SELECT COUNT(DISTINCT log_date) AS n FROM workout_logs "
            "WHERE user_id = ? AND log_date >= ? AND log_date <= ?",
            (user_id, period_start, period_end),
        ).fetchone()
    count = int(row["n"]) if row else 0
    pct = min(1.0, count / target) if target else None
    completed = count >= target
    return {
        "current_fields": {"current_count": count},
        "progress_pct": pct,
        "snapshot_value": float(count),
        "paused": False,
        "completed": completed,
    }


# --- FIT-06: N-week workout consistency (streak) ---

def _progress_workout_consistency(goal: dict, user_id: int) -> dict:
    target_weeks = goal.get("target_streak_length") or 0
    streak = _weeks_with_min_workouts(user_id, min_per_week=3)
    pct = min(1.0, streak / target_weeks) if target_weeks else None
    completed = target_weeks > 0 and streak >= target_weeks
    return {
        "current_fields": {"current_streak_length": streak},
        "progress_pct": pct,
        "snapshot_value": float(streak),
        "paused": False,
        "completed": completed,
    }


def _weeks_with_min_workouts(user_id: int, min_per_week: int = 3) -> int:
    """Count consecutive weeks (Monday–Sunday), ending last complete week,
    where the user hit ≥ min_per_week workouts. Current (incomplete) week
    doesn't break the streak."""
    today = date.today()
    # Last complete week ends on last Sunday
    last_sun = today - timedelta(days=(today.weekday() + 1) % 7 or 7)
    if last_sun >= today:
        last_sun = today - timedelta(days=7)
    streak = 0
    week_end = last_sun
    while True:
        week_start = week_end - timedelta(days=6)
        with get_conn() as conn:
            row = conn.execute(
                "SELECT COUNT(DISTINCT log_date) AS n FROM workout_logs "
                "WHERE user_id = ? AND log_date >= ? AND log_date <= ?",
                (user_id, week_start.isoformat(), week_end.isoformat()),
            ).fetchone()
        n = int(row["n"]) if row else 0
        if n >= min_per_week:
            streak += 1
            week_end = week_start - timedelta(days=1)
            if streak > 520:  # 10-year safety bound
                break
            continue
        break
    return streak


# --- NUT-01: Protein streak ---
# --- NUT-02: Calorie target streak ---
# --- NUT-03: Log every meal streak ---

def _progress_daily_streak(qualifies_fn):
    """Walks back from yesterday counting consecutive qualifying days. Does
    NOT use today (in-progress day). If yesterday doesn't qualify, streak=0."""
    def inner(goal: dict, user_id: int) -> dict:
        target = goal.get("target_streak_length") or 0
        streak = 0
        day = date.today() - timedelta(days=1)
        for _ in range(400):  # ~13 months safety bound
            if qualifies_fn(user_id, day):
                streak += 1
                day = day - timedelta(days=1)
                continue
            break
        pct = min(1.0, streak / target) if target else None
        completed = target > 0 and streak >= target
        return {
            "current_fields": {"current_streak_length": streak},
            "progress_pct": pct,
            "snapshot_value": float(streak),
            "paused": False,
            "completed": completed,
        }
    return inner


def _qualifies_protein(user_id: int, d: date) -> bool:
    with get_conn() as conn:
        g = conn.execute(
            "SELECT protein_g FROM user_goals WHERE user_id = ?", (user_id,),
        ).fetchone()
        if not g or not g["protein_g"]:
            return False
        row = conn.execute(
            "SELECT COALESCE(SUM(protein_g), 0) AS total FROM meal_logs "
            "WHERE user_id = ? AND log_date = ?",
            (user_id, d.isoformat()),
        ).fetchone()
    total = float(row["total"]) if row else 0.0
    return total >= float(g["protein_g"]) * 0.95  # 95% counts as 'hit'


def _qualifies_calorie(user_id: int, d: date) -> bool:
    with get_conn() as conn:
        g = conn.execute(
            "SELECT calorie_target FROM user_goals WHERE user_id = ?", (user_id,),
        ).fetchone()
        if not g or not g["calorie_target"]:
            return False
        row = conn.execute(
            "SELECT COALESCE(SUM(calories), 0) AS total FROM meal_logs "
            "WHERE user_id = ? AND log_date = ?",
            (user_id, d.isoformat()),
        ).fetchone()
    total = float(row["total"]) if row else 0.0
    target = float(g["calorie_target"])
    return 0.95 * target <= total <= 1.05 * target


def _qualifies_three_meals(user_id: int, d: date) -> bool:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT COUNT(*) AS n FROM meal_logs WHERE user_id = ? AND log_date = ?",
            (user_id, d.isoformat()),
        ).fetchone()
    return int(row["n"]) >= 3 if row else False


# --- NUT-04: 30-day protein average (rate) ---

def _progress_protein_avg(goal: dict, user_id: int) -> dict:
    window = goal.get("window_size") or 30
    target = goal.get("target_rate")
    today = date.today()
    start = (today - timedelta(days=window)).isoformat()
    end = (today - timedelta(days=1)).isoformat()
    with get_conn() as conn:
        row = conn.execute(
            "SELECT COALESCE(SUM(protein_g), 0) / ? AS avg_g "
            "FROM meal_logs WHERE user_id = ? AND log_date >= ? AND log_date <= ?",
            (float(window), user_id, start, end),
        ).fetchone()
    avg_g = float(row["avg_g"]) if row else 0.0
    pct = min(1.0, avg_g / target) if target else None
    completed = target is not None and avg_g >= target
    return {
        "current_fields": {"current_rate": avg_g},
        "progress_pct": pct,
        "snapshot_value": avg_g,
        "paused": False,
        "completed": completed,
    }


# --- Dispatch table ---

def _progress_monthly_spending_limit(goal: dict, user_id: int) -> dict:
    """FIN-04 — cap monthly spend below a target. progress = 1 when user
    is under pace; decays to 0 at 2× pace. Period resets automatically
    with finance_transactions.txn_date (not via goal.period_end like
    other period_count goals — monthly spend limit is a rolling month)."""
    import finance as _fin
    target = goal.get("target_count") or goal.get("target_value")
    if not target:
        return _paused_handler(goal, user_id)
    # Does the user have finance data at all? If zero txns AND no budget,
    # we're not "active" — return paused so the UI shows reconnect hint.
    with get_conn() as conn:
        n = conn.execute(
            "SELECT COUNT(*) AS n FROM finance_transactions WHERE user_id = ?",
            (user_id,),
        ).fetchone()["n"]
    if n == 0:
        return _paused_handler(goal, user_id)

    spent = _fin.monthly_spend_to_date(user_id)
    from datetime import date as _d
    today = _d.today()
    elapsed = today.day
    days_in_month = 30
    expected = float(target) * (elapsed / days_in_month)
    # progress_pct for the pace bar: fraction of monthly cap used.
    cap_usage = min(1.0, spent / float(target)) if target else None
    completed_failed = spent >= float(target)
    # completed here means "full calendar month finished without exceeding cap".
    # We don't auto-complete mid-month; the scheduler / month-end job
    # would flip it. For v1, completion is manual.
    return {
        "current_fields": {"current_count": round(spent, 2)},
        "progress_pct": cap_usage,
        "snapshot_value": spent,
        "paused": False,
        "completed": False,  # don't auto-complete on overspend
    }


def _progress_budget_streak(goal: dict, user_id: int) -> dict:
    """FIN-05 — consecutive weeks at/under budget. Needs a budget set."""
    import finance as _fin
    from datetime import date as _d, timedelta as _td
    budgets = _fin.get_budgets(user_id)
    if not budgets:
        return _paused_handler(goal, user_id)
    target = goal.get("target_streak_length") or 0
    # Walk back from last complete week.
    today = _d.today()
    last_sun = today - _td(days=(today.weekday() + 1) % 7 or 7)
    if last_sun >= today:
        last_sun = today - _td(days=7)
    streak = 0
    week_end = last_sun
    for _ in range(260):
        week_start = week_end - _td(days=6)
        if _fin.had_budget_adherent_week(user_id, week_start, budgets=budgets):
            streak += 1
            week_end = week_start - _td(days=1)
            continue
        break
    pct = min(1.0, streak / target) if target else None
    completed = target > 0 and streak >= target
    return {
        "current_fields": {"current_streak_length": streak},
        "progress_pct": pct,
        "snapshot_value": float(streak),
        "paused": False,
        "completed": completed,
    }


_PROGRESS_HANDLERS = {
    "FIT-01": _progress_weight,
    "FIT-02": _progress_strength_pr("squat"),
    "FIT-03": _progress_strength_pr("bench"),
    "FIT-04": _progress_strength_pr("deadlift"),
    "FIT-05": _progress_workouts_period,
    "FIT-06": _progress_workout_consistency,
    "NUT-01": _progress_daily_streak(_qualifies_protein),
    "NUT-02": _progress_daily_streak(_qualifies_calorie),
    "NUT-03": _progress_daily_streak(_qualifies_three_meals),
    "NUT-04": _progress_protein_avg,
    "FIN-04": _progress_monthly_spending_limit,
    "FIN-05": _progress_budget_streak,
    # NUT-05, FIN-01/02/03, TIME-*: default _paused_handler.
    # FIN-01/02/03 (cumulative savings/debt) need account balances which
    # need Plaid — stay paused until Plaid lands.
}


# ── Pace ──────────────────────────────────────────────────────────────────


def compute_pace(goal: dict, progress_pct: float | None = None, paused: bool = False) -> dict:
    """Per PRD §4.10.6. Returns {indicator, ratio, label}.

    indicator ∈ {'ahead', 'on_track', 'behind', 'neutral', 'paused',
    'complete', 'broken'}."""
    if goal.get("status") == "completed":
        return {"indicator": "complete", "ratio": None, "label": "Complete"}
    if paused:
        return {"indicator": "paused", "ratio": None, "label": "Reconnect source"}

    goal_type = goal["goal_type"]
    if goal_type == "cumulative_numeric":
        return _pace_cumulative(goal, progress_pct)
    if goal_type == "period_count":
        return _pace_period_count(goal)
    if goal_type == "streak":
        return _pace_streak(goal)
    if goal_type == "rate":
        return _pace_rate(goal)
    if goal_type == "best_attempt":
        return _pace_best_attempt(goal)
    return {"indicator": "neutral", "ratio": None, "label": ""}


def _pace_cumulative(goal: dict, progress_pct: float | None) -> dict:
    deadline = goal.get("deadline")
    created = goal.get("created_at")
    if not (deadline and created and progress_pct is not None):
        return {"indicator": "neutral", "ratio": None, "label": ""}
    try:
        d_end = date.fromisoformat(deadline)
        d_start = datetime.fromisoformat(created).date()
    except Exception:
        return {"indicator": "neutral", "ratio": None, "label": ""}
    total = (d_end - d_start).days
    if total <= 0:
        return {"indicator": "neutral", "ratio": None, "label": ""}
    elapsed = (date.today() - d_start).days
    if elapsed < 7:
        return {"indicator": "neutral", "ratio": None, "label": "Too early to tell"}
    expected = elapsed / total
    if expected <= 0:
        return {"indicator": "neutral", "ratio": None, "label": ""}
    ratio = progress_pct / expected
    return _ratio_to_pace(ratio)


def _pace_period_count(goal: dict) -> dict:
    ps = goal.get("period_start"); pe = goal.get("period_end")
    target = goal.get("target_count"); current = goal.get("current_count") or 0
    if not (ps and pe and target):
        return {"indicator": "neutral", "ratio": None, "label": ""}
    try:
        d_start = date.fromisoformat(ps); d_end = date.fromisoformat(pe)
    except Exception:
        return {"indicator": "neutral", "ratio": None, "label": ""}
    total = (d_end - d_start).days + 1
    elapsed = max(0, (date.today() - d_start).days + 1)
    if total <= 0 or elapsed == 0:
        return {"indicator": "neutral", "ratio": None, "label": ""}
    expected = (elapsed / total) * target
    if expected <= 0:
        return {"indicator": "neutral", "ratio": None, "label": ""}
    ratio = current / expected
    return _ratio_to_pace(ratio)


def _pace_streak(goal: dict) -> dict:
    cur = goal.get("current_streak_length") or 0
    tgt = goal.get("target_streak_length") or 0
    if cur > 0:
        return {"indicator": "ahead" if cur >= tgt else "on_track", "ratio": None,
                "label": f"Streak alive · {cur}/{tgt}"}
    return {"indicator": "neutral", "ratio": None, "label": "Not started"}


def _pace_rate(goal: dict) -> dict:
    cur = goal.get("current_rate"); tgt = goal.get("target_rate")
    if cur is None or tgt is None or tgt == 0:
        return {"indicator": "neutral", "ratio": None, "label": ""}
    ratio = cur / tgt
    if ratio >= 1.0:
        return {"indicator": "on_track", "ratio": ratio, "label": "On track"}
    if ratio >= 0.90:
        return {"indicator": "behind", "ratio": ratio, "label": "Close"}
    return {"indicator": "behind", "ratio": ratio, "label": "Behind"}


def _pace_best_attempt(goal: dict) -> dict:
    best = goal.get("best_attempt_value"); target = goal.get("target_value")
    baseline = goal.get("baseline_value") or 0
    if best is None or target is None:
        return {"indicator": "neutral", "ratio": None, "label": "Not started"}
    direction = goal.get("direction", "increase")
    beat = (best >= target) if direction == "increase" else (best <= target)
    if beat:
        return {"indicator": "complete", "ratio": None, "label": "Hit target"}
    past_baseline = (best > baseline) if direction == "increase" else (best < baseline)
    if past_baseline:
        return {"indicator": "on_track", "ratio": None, "label": "Getting closer"}
    return {"indicator": "neutral", "ratio": None, "label": f"{best} → {target}"}


def _ratio_to_pace(ratio: float) -> dict:
    if ratio >= 1.10:
        return {"indicator": "ahead", "ratio": ratio, "label": "Ahead"}
    if ratio >= 0.95:
        return {"indicator": "on_track", "ratio": ratio, "label": "On track"}
    return {"indicator": "behind", "ratio": ratio, "label": "Behind"}


# ── Helpers ──────────────────────────────────────────────────────────────


def _cumulative_pct(start: Any, target: Any, current: Any, direction: str | None) -> float | None:
    if start is None or target is None or current is None:
        return None
    try:
        s = float(start); t = float(target); c = float(current)
    except (TypeError, ValueError):
        return None
    if t == s:
        return 1.0 if c == t else 0.0
    if direction == "decrease" or (direction is None and t < s):
        raw = (s - c) / (s - t)
    else:
        raw = (c - s) / (t - s)
    return max(0.0, min(1.0, raw))


def _best_attempt_pct(baseline: Any, target: Any, best: Any, direction: str) -> float | None:
    if target is None or best is None:
        return None
    try:
        b = float(baseline) if baseline is not None else 0.0
        t = float(target); x = float(best)
    except (TypeError, ValueError):
        return None
    if direction == "decrease":
        if b == t: return 1.0 if x <= t else 0.0
        raw = (b - x) / (b - t)
    else:
        if b == t: return 1.0 if x >= t else 0.0
        raw = (x - b) / (t - b)
    return max(0.0, min(1.0, raw))


# ── Orchestration ────────────────────────────────────────────────────────


def recompute_and_persist_goal(goal_id: int, user_id: int, goal: dict | None = None) -> dict:
    """Run progress + pace, write current_* fields and a daily snapshot
    back to DB, return the enriched goal dict (fields updated in-place)."""
    from db import get_goal, update_goal_progress, save_goal_progress_snapshot, mark_goal_completed
    if goal is None:
        goal = get_goal(goal_id, user_id)
        if not goal:
            return {}
    result = compute_goal_progress(goal, user_id)
    if result["current_fields"]:
        update_goal_progress(goal_id, result["current_fields"])
        goal.update(result["current_fields"])
    save_goal_progress_snapshot(
        goal_id, date.today().isoformat(),
        result.get("progress_pct"), result.get("snapshot_value"),
    )
    if result.get("completed") and goal.get("status") == "active":
        mark_goal_completed(goal_id, user_id)
        goal["status"] = "completed"
    pace = compute_pace(goal, progress_pct=result.get("progress_pct"),
                        paused=result.get("paused", False))
    goal["progress_pct"] = result.get("progress_pct")
    goal["paused"] = result.get("paused", False)
    goal["pace"] = pace
    return goal


def recompute_all_active_goals(user_id: int) -> list[dict]:
    """Hot path: called by /api/goals to refresh every active goal before
    serializing. In v1 we run synchronously per-request; post-launch this
    moves to a nightly job + on-change triggers."""
    from db import list_user_goals
    out = []
    for g in list_user_goals(user_id, statuses=["active"]):
        try:
            out.append(recompute_and_persist_goal(g["goal_id"], user_id, g))
        except Exception:
            # Never let one bad goal break the whole list.
            import logging as _log_mod
            _log_mod.getLogger(__name__).exception(
                "goals_engine: recompute failed for goal_id=%s", g.get("goal_id"),
            )
            g["paused"] = True
            g["pace"] = {"indicator": "paused", "ratio": None, "label": "Error"}
            out.append(g)
    return out
