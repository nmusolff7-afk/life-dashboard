"""Patterns view — deterministic 14-day rollups + AI synthesis hook.

Per PRD §4.3 (Patterns). Two-tier per BUILD_PLAN.md → Vision:

- **Deterministic patterns** (this module's `compute_patterns`):
  pure-function rollups across the last 14 days. No AI, no
  randomness. Sleep duration / active calories / screen time / top
  locations / calendar density.
- **AI synthesis** (`synthesize_insights`): Claude Haiku reads the
  pattern dict and surfaces 3 plain-English insights. Descriptive
  per PRD §3.3 — never prescriptive ("you slept poorly Monday and
  Tuesday" is fine; "you should sleep earlier" is not).

User-invoked only — synthesis fires when the user taps "Refresh
insights" on the Patterns view, NOT on every patterns fetch. Cost
guardrail: ~1 Haiku call per insights tap, well under a penny.
"""

from __future__ import annotations

import json as _json
import logging as _logging
from datetime import date, timedelta
from typing import Any

from db import get_conn

_log = _logging.getLogger(__name__)

DEFAULT_WINDOW_DAYS = 14


def compute_patterns(user_id: int, today_iso: str | None = None,
                     window_days: int = DEFAULT_WINDOW_DAYS) -> dict:
    """Pure 14-day deterministic rollup. Returns a JSON-shaped dict
    suitable for both client rendering and AI prompt input.

    Each section gracefully handles missing data — a user with no HC
    connected just gets `sleep: null`, not an exception.
    """
    today = date.fromisoformat(today_iso) if today_iso else date.today()
    start = today - timedelta(days=window_days)

    return {
        "window_days": window_days,
        "today": today.isoformat(),
        "sleep":      _sleep_pattern(user_id, start, today),
        "movement":   _movement_pattern(user_id, start, today),
        "screen":     _screen_pattern(user_id, start, today),
        "places":     _places_pattern(user_id, start, today),
        "calendar":   _calendar_pattern(user_id, start, today),
        "nutrition":  _nutrition_pattern(user_id, start, today),
        "workouts":   _workouts_pattern(user_id, start, today),
    }


def _sleep_pattern(user_id: int, start: date, today: date) -> dict | None:
    """avg sleep minutes, std-dev, days reported."""
    with get_conn() as conn:
        try:
            rows = conn.execute(
                "SELECT sleep_minutes FROM health_daily "
                "WHERE user_id = ? AND stat_date >= ? AND stat_date <= ? "
                "AND sleep_minutes IS NOT NULL",
                (user_id, start.isoformat(), today.isoformat()),
            ).fetchall()
        except Exception:
            return None
    vals = [int(r["sleep_minutes"]) for r in rows if r["sleep_minutes"] is not None]
    if not vals:
        return None
    mean = sum(vals) / len(vals)
    variance = sum((v - mean) ** 2 for v in vals) / len(vals)
    sd = variance ** 0.5
    return {
        "days_reported": len(vals),
        "avg_minutes":   round(mean),
        "stddev_minutes": round(sd, 1),
        "min_minutes":   min(vals),
        "max_minutes":   max(vals),
    }


def _movement_pattern(user_id: int, start: date, today: date) -> dict | None:
    """active_kcal + steps averages, plus top day-of-week."""
    with get_conn() as conn:
        try:
            rows = conn.execute(
                "SELECT stat_date, steps, active_kcal FROM health_daily "
                "WHERE user_id = ? AND stat_date >= ? AND stat_date <= ?",
                (user_id, start.isoformat(), today.isoformat()),
            ).fetchall()
        except Exception:
            return None
    rows = [dict(r) for r in rows]
    if not rows:
        return None
    steps_vals = [int(r["steps"]) for r in rows if r["steps"] is not None]
    kcal_vals  = [int(r["active_kcal"]) for r in rows if r["active_kcal"] is not None]

    # Day-of-week max — which day tends to be most active.
    by_dow: dict[int, list[int]] = {}
    for r in rows:
        if r["active_kcal"] is None:
            continue
        try:
            d = date.fromisoformat(r["stat_date"])
        except Exception:
            continue
        by_dow.setdefault(d.weekday(), []).append(int(r["active_kcal"]))
    DOW_LABEL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    most_active_dow = None
    if by_dow:
        avg_by_dow = {k: sum(v) / len(v) for k, v in by_dow.items()}
        peak = max(avg_by_dow, key=lambda k: avg_by_dow[k])
        most_active_dow = DOW_LABEL[peak]

    return {
        "days_reported":   len(rows),
        "avg_steps":       round(sum(steps_vals) / len(steps_vals)) if steps_vals else None,
        "avg_active_kcal": round(sum(kcal_vals) / len(kcal_vals)) if kcal_vals else None,
        "most_active_day_of_week": most_active_dow,
    }


def _screen_pattern(user_id: int, start: date, today: date) -> dict | None:
    """avg total minutes + weekday vs weekend split + top apps roll-up."""
    with get_conn() as conn:
        try:
            rows = conn.execute(
                "SELECT stat_date, total_minutes, top_apps_json FROM screen_time_daily "
                "WHERE user_id = ? AND stat_date >= ? AND stat_date <= ?",
                (user_id, start.isoformat(), today.isoformat()),
            ).fetchall()
        except Exception:
            return None
    rows = [dict(r) for r in rows]
    if not rows:
        return None
    weekday: list[int] = []
    weekend: list[int] = []
    app_minutes: dict[str, int] = {}
    for r in rows:
        try:
            d = date.fromisoformat(r["stat_date"])
        except Exception:
            continue
        mins = int(r["total_minutes"] or 0)
        if d.weekday() < 5:
            weekday.append(mins)
        else:
            weekend.append(mins)
        try:
            apps = _json.loads(r["top_apps_json"] or "[]") or []
            for a in apps[:5]:
                key = a.get("label") or a.get("package") or "?"
                app_minutes[key] = app_minutes.get(key, 0) + int(a.get("minutes") or 0)
        except Exception:
            pass

    top_apps = sorted(app_minutes.items(), key=lambda kv: kv[1], reverse=True)[:5]
    return {
        "days_reported": len(rows),
        "avg_minutes":   round(sum(weekday + weekend) / max(1, len(weekday + weekend))),
        "weekday_avg":   round(sum(weekday) / len(weekday)) if weekday else None,
        "weekend_avg":   round(sum(weekend) / len(weekend)) if weekend else None,
        "top_apps":      [{"label": k, "minutes": v} for k, v in top_apps],
    }


def _places_pattern(user_id: int, start: date, today: date) -> dict | None:
    """top recurring places + new places visited in window."""
    with get_conn() as conn:
        try:
            top = conn.execute(
                "SELECT place_name, place_label, total_dwell_minutes, last_seen "
                "FROM location_clusters WHERE user_id = ? "
                "ORDER BY total_dwell_minutes DESC LIMIT 5",
                (user_id,),
            ).fetchall()
            new_in_window = conn.execute(
                "SELECT COUNT(*) AS n FROM location_clusters "
                "WHERE user_id = ? AND first_seen >= ?",
                (user_id, start.isoformat()),
            ).fetchone()
        except Exception:
            return None
    if not top:
        return None
    return {
        "top_places": [
            {
                "name":       r["place_name"] or r["place_label"] or "unknown",
                "dwell_h":    round((r["total_dwell_minutes"] or 0) / 60, 1),
            }
            for r in top
        ],
        "new_places_in_window": int((new_in_window or {"n": 0})["n"]),
    }


def _calendar_pattern(user_id: int, start: date, today: date) -> dict | None:
    """avg meetings per weekday + focus minutes per week."""
    start_iso = start.isoformat()
    end_iso = (today + timedelta(days=1)).isoformat()
    with get_conn() as conn:
        try:
            gcal = conn.execute(
                "SELECT start_iso, end_iso, title FROM gcal_events "
                "WHERE user_id = ? AND start_iso >= ? AND start_iso < ? "
                "AND COALESCE(all_day, 0) = 0",
                (user_id, start_iso, end_iso),
            ).fetchall()
            outlook = conn.execute(
                "SELECT start_iso, end_iso, title FROM outlook_events "
                "WHERE user_id = ? AND start_iso >= ? AND start_iso < ? "
                "AND COALESCE(all_day, 0) = 0",
                (user_id, start_iso, end_iso),
            ).fetchall()
        except Exception:
            return None
    events = [dict(r) for r in gcal] + [dict(r) for r in outlook]
    if not events:
        return None

    # Days with at least one event
    by_date: dict[str, list[dict]] = {}
    for e in events:
        d = (e.get("start_iso") or "")[:10]
        if not d:
            continue
        by_date.setdefault(d, []).append(e)

    weekday_dates = [d for d in by_date if _is_weekday(d)]
    weekend_dates = [d for d in by_date if not _is_weekday(d)]
    weekday_meeting_count = sum(len(by_date[d]) for d in weekday_dates)
    avg_meetings_weekday = (
        round(weekday_meeting_count / len(weekday_dates), 1)
        if weekday_dates else None
    )

    # Focus minutes — events whose title matches /focus/i.
    from datetime import datetime as _dt
    focus_minutes = 0
    for e in events:
        title = (e.get("title") or "").lower()
        if "focus" not in title:
            continue
        try:
            s = _dt.fromisoformat((e["start_iso"] or "").replace("Z", "+00:00"))
            ee = _dt.fromisoformat((e["end_iso"] or "").replace("Z", "+00:00"))
            focus_minutes += max(0, int((ee - s).total_seconds() // 60))
        except Exception:
            continue

    return {
        "events_total":          len(events),
        "days_with_events":      len(by_date),
        "avg_meetings_weekday":  avg_meetings_weekday,
        "focus_minutes_total":   focus_minutes,
        "focus_hours_per_week":  round((focus_minutes / 60) / max(1, _weeks(start, today)), 1),
    }


def _nutrition_pattern(user_id: int, start: date, today: date) -> dict | None:
    """avg cal/protein, days within 5% of target, missed days."""
    with get_conn() as conn:
        try:
            rows = conn.execute(
                """SELECT log_date,
                          COALESCE(SUM(calories), 0) AS cal,
                          COALESCE(SUM(protein_g), 0) AS prot
                   FROM meal_logs WHERE user_id = ?
                   AND log_date >= ? AND log_date <= ?
                   GROUP BY log_date""",
                (user_id, start.isoformat(), today.isoformat()),
            ).fetchall()
            goal = conn.execute(
                "SELECT calorie_target, protein_g FROM user_goals WHERE user_id = ?",
                (user_id,),
            ).fetchone()
        except Exception:
            return None
    rows = [dict(r) for r in rows]
    if not rows:
        return None
    cal_target = int(goal["calorie_target"]) if goal and goal["calorie_target"] else 2000
    prot_target = int(goal["protein_g"]) if goal and goal["protein_g"] else 150
    days_logged = len(rows)
    avg_cal = round(sum(r["cal"] for r in rows) / days_logged) if rows else 0
    avg_prot = round(sum(r["prot"] for r in rows) / days_logged) if rows else 0
    cal_hit_days = sum(
        1 for r in rows
        if cal_target * 0.95 <= r["cal"] <= cal_target * 1.05
    )
    prot_hit_days = sum(1 for r in rows if r["prot"] >= prot_target * 0.95)
    return {
        "days_logged":           days_logged,
        "avg_calories":          avg_cal,
        "avg_protein_g":         avg_prot,
        "calorie_target":        cal_target,
        "protein_target_g":      prot_target,
        "calorie_hit_rate":      round(cal_hit_days / max(1, days_logged), 2),
        "protein_hit_rate":      round(prot_hit_days / max(1, days_logged), 2),
    }


def _workouts_pattern(user_id: int, start: date, today: date) -> dict | None:
    with get_conn() as conn:
        try:
            rows = conn.execute(
                """SELECT log_date, COUNT(*) AS n,
                          COALESCE(SUM(calories_burned), 0) AS burn
                   FROM workout_logs WHERE user_id = ?
                   AND log_date >= ? AND log_date <= ?
                   GROUP BY log_date""",
                (user_id, start.isoformat(), today.isoformat()),
            ).fetchall()
        except Exception:
            return None
    rows = [dict(r) for r in rows]
    if not rows:
        return None
    days_with_workout = len(rows)
    total_workouts = sum(int(r["n"]) for r in rows)
    avg_burn = round(sum(int(r["burn"]) for r in rows) / max(1, days_with_workout))
    return {
        "days_with_workout":   days_with_workout,
        "total_workouts":      total_workouts,
        "avg_burn_per_day":    avg_burn,
        "workouts_per_week":   round(total_workouts / max(1, _weeks(start, today)), 1),
    }


def _is_weekday(date_str: str) -> bool:
    try:
        return date.fromisoformat(date_str).weekday() < 5
    except Exception:
        return True


def _weeks(start: date, end: date) -> float:
    return max(1.0, (end - start).days / 7.0)


# ── AI synthesis ──────────────────────────────────────────────────

def synthesize_insights(user_id: int, patterns: dict) -> list[dict]:
    """Use Claude Haiku to surface 3 plain-English insights from the
    deterministic patterns. Per PRD §3.3 the model must be descriptive
    only — narrate what happened; never prescribe.

    Returns: [{"headline": str, "detail": str, "tag": str}, ...]
    Empty list on any failure (caller should show "couldn't generate
    insights" and let the user retry)."""
    try:
        from ai_client import get_client
        client = get_client()
    except Exception:
        return []

    system = (
        "You analyze a user's 14-day life patterns and surface 3 short "
        "plain-English observations they'd find interesting. Constraints:\n"
        "- ALWAYS descriptive ('your weekend screen time runs 30% higher "
        "than weekdays') — NEVER prescriptive ('you should reduce screen "
        "time').\n"
        "- Reference real numbers from the data; don't make claims you "
        "can't back up.\n"
        "- If a section is null/empty, skip it — don't speculate.\n"
        "- Tone is neutral, observational, not coachy.\n"
        "- Reply with strict JSON only.\n"
    )
    user = (
        "Here are this user's 14-day patterns. Generate 3 observations.\n\n"
        f"PATTERNS_JSON:\n{_json.dumps(patterns, indent=2)}\n\n"
        "Reply with `{\"insights\": [{\"headline\": \"<short title>\", "
        "\"detail\": \"<one-sentence observation referencing real "
        "numbers>\", \"tag\": \"<sleep|movement|screen|places|calendar"
        "|nutrition|workouts>\"}, ...]}` — exactly 3 entries."
    )

    try:
        resp = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=600,
            system=system,
            messages=[{"role": "user", "content": user}],
            timeout=20.0,
        )
        text = "".join(b.text for b in resp.content if hasattr(b, "text")).strip()
        if text.startswith("```"):
            text = text.strip("`")
            if text.startswith("json"):
                text = text[4:]
            text = text.strip()
        parsed = _json.loads(text)
        out = parsed.get("insights") if isinstance(parsed, dict) else None
        if not isinstance(out, list):
            return []
        # Sanitize — keep only the expected keys.
        return [
            {
                "headline": str(item.get("headline", ""))[:120],
                "detail":   str(item.get("detail", ""))[:280],
                "tag":      str(item.get("tag", "") or "general")[:24],
            }
            for item in out
            if isinstance(item, dict)
        ][:3]
    except Exception:
        _log.exception("patterns_engine: Haiku synthesis failed")
        return []
