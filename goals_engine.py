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


def _qualifies_all_priority_tasks_done(user_id: int, d: date) -> bool:
    """True if the user had at least one priority task due on/before day `d`
    AND all of them were completed (priority=1 rows either completed on
    that day, or completed already and weren't outstanding)."""
    day = d.isoformat()
    with get_conn() as conn:
        # All priority tasks that should have been done by EOD of `d`:
        rows = conn.execute(
            """
            SELECT id, completed, completed_at, due_date, task_date
            FROM mind_tasks
            WHERE user_id = ?
              AND priority = 1
              AND ((due_date IS NOT NULL AND due_date <= ?) OR (due_date IS NULL AND task_date <= ?))
            """,
            (user_id, day, day),
        ).fetchall()
    rows = [dict(r) for r in rows]
    if not rows:
        return False  # no priority tasks = nothing to qualify on
    for r in rows:
        if not r.get("completed"):
            return False
        # If the row was completed but after `d`, it wasn't "done by EOD of d".
        ca = (r.get("completed_at") or "")[:10]
        if ca and ca > day:
            return False
    return True


# ── TIME-02 / TIME-05 / TIME-06 (§14.8) ───────────────────────────────────
#
# Three time-category goals wired up once the connectors that back them
# shipped in C1: screen-time daily aggregates, calendar (gcal+outlook),
# and foreground location samples. Per-goal config (cap minutes,
# cluster_id, etc.) lives in goals.config_json.
#
# Deferred for a follow-up phase:
#   - TIME-03 social-cap streak: needs per-app categorization in
#     screen_time_daily.top_apps_json before we can sum "social" minutes.
#   - TIME-04 phone-down-after-cutoff streak: screen_time_daily is
#     daily-only; needs hourly sampling from UsageStatsManager. Plumbing
#     hourly buckets is its own work.

def _goal_config(goal: dict) -> dict:
    """Parse goals.config_json into a dict. Returns {} on missing/bad JSON."""
    raw = goal.get("config_json")
    if isinstance(raw, dict):
        return raw  # already-parsed (e.g. unit tests)
    if not raw:
        return {}
    try:
        import json as _json
        return _json.loads(raw)
    except Exception:
        return {}


# --- TIME-02: Screen-time cap streak (daily) ---

def _qualifies_screen_time_under_cap(cap_minutes: int):
    """Returns a per-day predicate. Day qualifies iff
    screen_time_daily.total_minutes <= cap_minutes.
    Days with no row don't qualify (data must be present to count)."""
    def inner(user_id: int, d: date) -> bool:
        with get_conn() as conn:
            row = conn.execute(
                "SELECT total_minutes FROM screen_time_daily "
                "WHERE user_id = ? AND stat_date = ?",
                (user_id, d.isoformat()),
            ).fetchone()
        if not row:
            return False
        return int(row["total_minutes"] or 0) <= cap_minutes
    return inner


def _progress_screen_time_cap(goal: dict, user_id: int) -> dict:
    cfg = _goal_config(goal)
    cap = cfg.get("daily_cap_minutes")
    if not (isinstance(cap, (int, float)) and cap > 0):
        return _paused_handler(goal, user_id)
    # Need at least one row of screen_time_daily, else there's no data
    # source — render as paused (UI: "Reconnect source").
    with get_conn() as conn:
        n = conn.execute(
            "SELECT COUNT(*) AS n FROM screen_time_daily WHERE user_id = ?",
            (user_id,),
        ).fetchone()["n"]
    if n == 0:
        return _paused_handler(goal, user_id)
    return _progress_daily_streak(_qualifies_screen_time_under_cap(int(cap)))(goal, user_id)


# --- TIME-05: Focus time per period (period_count) ---
#
# Sums duration of any calendar event (Google or Outlook) whose title
# contains "focus" (case-insensitive) within the goal's period window.
# Convention: target_count is HOURS (matches library default_target=10).

def _focus_minutes_in_window(user_id: int, start_iso: str, end_iso: str) -> int:
    """Total minutes of focus events across gcal_events + outlook_events
    whose start_iso falls inside [start_iso, end_iso] (date strings).
    Title match is a case-insensitive 'focus' substring."""
    # ISO date strings compared lexicographically work for the YYYY-MM-DD
    # prefix; events store full ISO timestamps so we use start_iso < (end+1)
    # by appending T99 isn't safe — instead bound on the start_iso column
    # against day-prefix comparisons.
    lo = start_iso          # 'YYYY-MM-DD'
    hi = end_iso + "T99"    # any timestamp on end_iso < this
    sql = (
        "SELECT start_iso, end_iso FROM {table} "
        "WHERE user_id = ? AND lower(title) LIKE '%focus%' "
        "AND start_iso >= ? AND start_iso < ?"
    )
    rows: list = []
    with get_conn() as conn:
        for table in ("gcal_events", "outlook_events"):
            try:
                rows.extend(conn.execute(
                    sql.format(table=table), (user_id, lo, hi)
                ).fetchall())
            except Exception:
                # Table may not exist on a fresh DB; treat as empty.
                pass
    total = 0
    for r in rows:
        s = (r["start_iso"] or "")
        e = (r["end_iso"] or "")
        try:
            sd = datetime.fromisoformat(s.replace("Z", "+00:00"))
            ed = datetime.fromisoformat(e.replace("Z", "+00:00"))
            mins = max(0, int((ed - sd).total_seconds() // 60))
            total += mins
        except Exception:
            continue
    return total


def _progress_focus_period(goal: dict, user_id: int) -> dict:
    period_start = goal.get("period_start")
    period_end = goal.get("period_end")
    target_hours = goal.get("target_count")
    if not (period_start and period_end and target_hours):
        return _paused_handler(goal, user_id)
    # If the user has zero calendar events at all, treat as paused so the UI
    # nudges them to connect a calendar.
    with get_conn() as conn:
        n_g = conn.execute("SELECT COUNT(*) AS n FROM gcal_events WHERE user_id = ?",
                           (user_id,)).fetchone()["n"]
        n_o = conn.execute("SELECT COUNT(*) AS n FROM outlook_events WHERE user_id = ?",
                           (user_id,)).fetchone()["n"]
    if (n_g + n_o) == 0:
        return _paused_handler(goal, user_id)
    minutes = _focus_minutes_in_window(user_id, period_start, period_end)
    hours = minutes / 60.0
    pct = min(1.0, hours / float(target_hours)) if target_hours else None
    completed = hours >= float(target_hours)
    return {
        "current_fields": {"current_count": int(round(hours))},
        "progress_pct": pct,
        "snapshot_value": hours,
        "paused": False,
        "completed": completed,
    }


# --- TIME-06: Location visits to a chosen cluster (weekly streak) ---
#
# config_json must include cluster_id (the location_clusters row to count
# visits to) and weekly_visits_target (visits/week needed to qualify the
# week). target_streak_length is the streak goal in weeks.
#
# A "visit" = one or more samples within ~50m of the cluster centroid
# during a calendar day. Multiple samples in the same day count once.

_CLUSTER_RADIUS_M = 75.0


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Approximate distance between two lat/lon pairs in meters. Matches the
    formula location_engine uses for clustering (small angle / spherical)."""
    import math as _math
    R = 6371000.0
    p1 = _math.radians(lat1); p2 = _math.radians(lat2)
    dp = _math.radians(lat2 - lat1); dl = _math.radians(lon2 - lon1)
    a = _math.sin(dp / 2) ** 2 + _math.cos(p1) * _math.cos(p2) * _math.sin(dl / 2) ** 2
    return 2 * R * _math.asin(_math.sqrt(a))


def _visits_to_cluster_in_week(user_id: int, cluster_id: int,
                               week_start: date, week_end: date) -> int:
    """Distinct days within [week_start, week_end] that have at least one
    sample within _CLUSTER_RADIUS_M of the cluster centroid."""
    with get_conn() as conn:
        cluster = conn.execute(
            "SELECT centroid_lat, centroid_lon FROM location_clusters "
            "WHERE id = ? AND user_id = ?",
            (cluster_id, user_id),
        ).fetchone()
        if not cluster:
            return 0
        rows = conn.execute(
            "SELECT lat, lon, sampled_at FROM location_samples "
            "WHERE user_id = ? AND substr(sampled_at, 1, 10) >= ? "
            "AND substr(sampled_at, 1, 10) <= ?",
            (user_id, week_start.isoformat(), week_end.isoformat()),
        ).fetchall()
    days_with_visit: set[str] = set()
    clat = float(cluster["centroid_lat"]); clon = float(cluster["centroid_lon"])
    for r in rows:
        d_m = _haversine_m(float(r["lat"]), float(r["lon"]), clat, clon)
        if d_m <= _CLUSTER_RADIUS_M:
            days_with_visit.add((r["sampled_at"] or "")[:10])
    return len(days_with_visit)


def _progress_location_visits_streak(goal: dict, user_id: int) -> dict:
    cfg = _goal_config(goal)
    cluster_id = cfg.get("cluster_id")
    weekly_target = cfg.get("weekly_visits_target") or 1
    streak_target = goal.get("target_streak_length") or 0
    if not (isinstance(cluster_id, int) and cluster_id > 0):
        return _paused_handler(goal, user_id)
    # No location data at all → paused.
    with get_conn() as conn:
        n = conn.execute(
            "SELECT COUNT(*) AS n FROM location_samples WHERE user_id = ?",
            (user_id,),
        ).fetchone()["n"]
    if n == 0:
        return _paused_handler(goal, user_id)
    today = date.today()
    last_sun = today - timedelta(days=(today.weekday() + 1) % 7 or 7)
    if last_sun >= today:
        last_sun = today - timedelta(days=7)
    streak = 0
    week_end = last_sun
    for _ in range(260):  # 5-year safety bound
        week_start = week_end - timedelta(days=6)
        visits = _visits_to_cluster_in_week(user_id, int(cluster_id),
                                            week_start, week_end)
        if visits >= int(weekly_target):
            streak += 1
            week_end = week_start - timedelta(days=1)
            continue
        break
    pct = min(1.0, streak / streak_target) if streak_target else None
    completed = streak_target > 0 and streak >= streak_target
    return {
        "current_fields": {"current_streak_length": streak},
        "progress_pct": pct,
        "snapshot_value": float(streak),
        "paused": False,
        "completed": completed,
    }


# --- TIME-07: Inbox-zero streak (daily) ---
#
# A day qualifies if every email received before that day's start
# is currently marked read. Approximation: we evaluate against
# current `gmail_cache` state (we don't store time-of-read), so a
# day stays "qualified" as long as the user eventually catches up.
# That's fine for the streak's intent — "did you achieve inbox
# zero" not "were you at inbox zero AT 11:59pm exactly."

def _qualifies_inbox_zero(user_id: int, d: date) -> bool:
    """Day d qualifies if no unread emails received before
    (d + 1 day)'s start remain unread now. The boundary is the
    NEXT day's start so emails received during d ARE counted —
    you have to read them by D+1 to qualify D."""
    cutoff_iso = (d + timedelta(days=1)).isoformat()
    with get_conn() as conn:
        try:
            row = conn.execute(
                "SELECT COUNT(*) AS n FROM gmail_cache "
                "WHERE user_id = ? AND is_read = 0 AND received_at < ?",
                (user_id, cutoff_iso),
            ).fetchone()
        except Exception:
            return False
    return int(row["n"]) == 0


def _progress_inbox_zero_streak(goal: dict, user_id: int) -> dict:
    """Gmail-only for v1; if Gmail isn't connected, paused."""
    with get_conn() as conn:
        try:
            n = conn.execute(
                "SELECT COUNT(*) AS n FROM gmail_cache WHERE user_id = ?",
                (user_id,),
            ).fetchone()["n"]
        except Exception:
            n = 0
    if n == 0:
        return _paused_handler(goal, user_id)
    return _progress_daily_streak(_qualifies_inbox_zero)(goal, user_id)


# --- FIT-07: Sleep regularity (rate, decrease direction) ---
#
# Target: standard deviation of sleep_minutes across the last
# `window_size` nights (default 14) ≤ `target_rate` minutes. Lower
# is better — direction='decrease'.

def _progress_sleep_regularity(goal: dict, user_id: int) -> dict:
    target = goal.get("target_rate")
    window = goal.get("window_size") or 14
    if not target:
        return _paused_handler(goal, user_id)
    today = date.today()
    start = (today - timedelta(days=int(window))).isoformat()
    with get_conn() as conn:
        try:
            rows = conn.execute(
                "SELECT sleep_minutes FROM health_daily "
                "WHERE user_id = ? AND stat_date >= ? "
                "AND sleep_minutes IS NOT NULL "
                "ORDER BY stat_date DESC LIMIT ?",
                (user_id, start, int(window)),
            ).fetchall()
        except Exception:
            return _paused_handler(goal, user_id)
    vals = [int(r["sleep_minutes"]) for r in rows if r["sleep_minutes"] is not None]
    if len(vals) < 5:
        # Need at least 5 nights of data for a meaningful SD.
        return {
            "current_fields": {},
            "progress_pct": None, "snapshot_value": None,
            "paused": False, "completed": False,
        }
    mean = sum(vals) / len(vals)
    variance = sum((v - mean) ** 2 for v in vals) / len(vals)
    sd = variance ** 0.5
    target_f = float(target)
    # Progress fraction: 1.0 when SD = 0, 0 when SD >= 2× target.
    pct = max(0.0, min(1.0, 1 - (sd / (2 * target_f)))) if target_f > 0 else None
    completed = sd <= target_f
    return {
        "current_fields": {"current_rate": round(sd, 1)},
        "progress_pct": pct,
        "snapshot_value": round(sd, 1),
        "paused": False,
        "completed": completed,
    }


# --- FIT-08: Daily movement (active calories) streak ---
#
# Day qualifies if `health_daily.active_kcal` >= per-goal config
# `daily_active_kcal_target`. Defaults to 300 if not set.

def _qualifies_active_kcal(target_kcal: int):
    def inner(user_id: int, d: date) -> bool:
        with get_conn() as conn:
            try:
                row = conn.execute(
                    "SELECT active_kcal FROM health_daily "
                    "WHERE user_id = ? AND stat_date = ?",
                    (user_id, d.isoformat()),
                ).fetchone()
            except Exception:
                return False
        if not row or row["active_kcal"] is None:
            return False
        return int(row["active_kcal"]) >= target_kcal
    return inner


def _progress_active_kcal_streak(goal: dict, user_id: int) -> dict:
    cfg = _goal_config(goal)
    target = cfg.get("daily_active_kcal_target") or 300
    if not (isinstance(target, (int, float)) and target > 0):
        return _paused_handler(goal, user_id)
    # No HC data → paused.
    with get_conn() as conn:
        try:
            n = conn.execute(
                "SELECT COUNT(*) AS n FROM health_daily WHERE user_id = ?",
                (user_id,),
            ).fetchone()["n"]
        except Exception:
            n = 0
    if n == 0:
        return _paused_handler(goal, user_id)
    return _progress_daily_streak(_qualifies_active_kcal(int(target)))(goal, user_id)


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
    "TIME-01": _progress_daily_streak(_qualifies_all_priority_tasks_done),
    "TIME-02": _progress_screen_time_cap,
    "TIME-05": _progress_focus_period,
    "TIME-06": _progress_location_visits_streak,
    # 2026-04-28 §14.4-followup expansion (3 new types).
    "TIME-07": _progress_inbox_zero_streak,
    "FIT-07":  _progress_sleep_regularity,
    "FIT-08":  _progress_active_kcal_streak,
    # Still paused (default _paused_handler):
    #   NUT-05 alcohol-free streak — needs alcohol classification on meal_logs.
    #   FIN-01/02/03 — Plaid not shipped.
    #   TIME-03 social cap — needs per-app categories on screen_time_daily.
    #   TIME-04 phone-down-after-cutoff — needs hourly screen-time data.
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
