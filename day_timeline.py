"""Day Timeline — deterministic hard-block computation.

Per PRD §4.6.5 (revised 2026-04-28; see BUILD_PLAN.md → Vision → PRD
overrides). Day Timeline is a two-tier model:

- **Hard blocks** (this module): pulled from authoritative sources —
  calendar events (Google + Outlook). Reproducible: same inputs always
  produce the same blocks. No AI involved.
- **Soft blocks** (§14.2.2, separate module): AI-labeled gap inference
  on the unaccounted hour-ranges between hard blocks. Not implemented
  yet.

v1 scope cuts (logged in PHASE_LOG):
- Tasks-with-time: `mind_tasks` table has no `task_time` field. Adding
  one is its own phase. Hard blocks from tasks come later.
- Sleep blocks: `health_daily.sleep_minutes` is a daily aggregate, not
  a session start/end. The HC custom Expo Module reads sleep duration
  but not session bounds. Sleep blocks unlock when §14.5.2 reads
  `SleepSessionRecord` start/end fields.

Public API:
- `compute_hard_blocks(user_id, date_iso)` → list of block dicts
- `recompute_day_timeline(user_id, date_iso)` → wipe-and-replace,
  then return the persisted blocks via db.list_day_blocks
"""

from __future__ import annotations

import json as _json
import logging as _logging
from datetime import date, datetime, timedelta

from db import (
    delete_hard_blocks_for_date,
    insert_day_block,
    list_day_blocks,
    get_conn,
)

_log = _logging.getLogger(__name__)


def compute_hard_blocks(user_id: int, date_iso: str) -> list[dict]:
    """Return the day's hard blocks. Pure read; no DB mutation.

    Args:
        date_iso: 'YYYY-MM-DD' (the user's local date).

    Returns:
        List of dicts with keys:
          block_start (ISO timestamp str),
          block_end   (ISO timestamp str),
          label       (str),
          source_type ('gcal' | 'outlook' | 'task'),
          source_id   (provider's event_id, or 'task:<id>'),
          source_json (raw event dict serialized).
        Sorted by block_start.
    """
    blocks: list[dict] = []
    blocks.extend(_calendar_blocks(user_id, date_iso, table="gcal_events", source_type="gcal"))
    blocks.extend(_calendar_blocks(user_id, date_iso, table="outlook_events", source_type="outlook"))
    blocks.extend(_task_blocks(user_id, date_iso))
    blocks.sort(key=lambda b: b["block_start"])
    return blocks


def _task_blocks(user_id: int, date_iso: str) -> list[dict]:
    """Pull tasks where task_date matches AND task_time is set.
    Default duration is 30min when task_duration_minutes is null —
    user-set value takes precedence."""
    out: list[dict] = []
    try:
        with get_conn() as conn:
            rows = conn.execute(
                "SELECT id, description, task_time, task_duration_minutes, "
                "priority, due_date FROM mind_tasks "
                "WHERE user_id = ? AND task_date = ? "
                "AND task_time IS NOT NULL AND completed = 0",
                (user_id, date_iso),
            ).fetchall()
    except Exception:
        _log.exception("day_timeline: failed to read mind_tasks")
        return []

    for r in rows:
        # task_time stored as 'HH:MM' — combine with task_date to make
        # an ISO timestamp. We don't know the user's tz at backend
        # time; keep it tz-naive ISO ('YYYY-MM-DDTHH:MM:00') and let
        # the client interpret as local. Same convention as the
        # calendar tables.
        time_str = (r["task_time"] or "").strip()
        if len(time_str) < 4:
            continue
        try:
            # Accept 'H:MM' as well as 'HH:MM'.
            hh, mm = time_str.split(":", 1)
            start_iso = f"{date_iso}T{int(hh):02d}:{int(mm):02d}:00"
            duration = int(r["task_duration_minutes"] or 30)
            start_dt = datetime.fromisoformat(start_iso)
            end_dt = start_dt + timedelta(minutes=duration)
            end_iso = end_dt.isoformat(timespec="seconds")
        except (ValueError, TypeError):
            continue

        payload = {
            "title": r["description"],
            "task_id": int(r["id"]),
            "priority": int(r["priority"] or 0),
            "due_date": r["due_date"],
            "duration_minutes": duration,
        }
        out.append({
            "block_start": start_iso,
            "block_end":   end_iso,
            "label":       r["description"] or "Task",
            "source_type": "task",
            "source_id":   f"task:{int(r['id'])}",
            "source_json": _json.dumps(payload),
        })
    return out


def _calendar_blocks(user_id: int, date_iso: str, *, table: str, source_type: str) -> list[dict]:
    """Pull events from gcal_events or outlook_events whose start_iso falls
    within the local-date window. All-day events are excluded (no
    bounded time range to render as a strip block)."""
    # ISO timestamp comparison: events on date_iso start with 'YYYY-MM-DD'.
    # Bound on start_iso prefix-match. Exclude all_day=1.
    out: list[dict] = []
    try:
        with get_conn() as conn:
            rows = conn.execute(
                f"SELECT event_id, title, location, start_iso, end_iso, "
                f"all_day, attendees_count, html_link "
                f"FROM {table} "
                f"WHERE user_id = ? "
                f"  AND substr(start_iso, 1, 10) = ? "
                f"  AND COALESCE(all_day, 0) = 0 "
                f"  AND start_iso IS NOT NULL "
                f"  AND end_iso IS NOT NULL",
                (user_id, date_iso),
            ).fetchall()
    except Exception:
        # Table may not exist on a fresh DB; treat as empty.
        _log.exception("day_timeline: failed to read %s", table)
        return []

    for r in rows:
        title = (r["title"] or "").strip() or "Calendar event"
        # Sanity: skip events with degenerate ranges.
        if r["end_iso"] <= r["start_iso"]:
            continue
        payload = {
            "title": title,
            "location": r["location"],
            "attendees_count": r["attendees_count"],
            "html_link": r["html_link"],
            "event_id": r["event_id"],
            "provider": source_type,
        }
        out.append({
            "block_start": r["start_iso"],
            "block_end":   r["end_iso"],
            "label":       title,
            "source_type": source_type,
            "source_id":   r["event_id"],
            "source_json": _json.dumps(payload),
        })
    return out


def recompute_day_timeline(user_id: int, date_iso: str) -> list[dict]:
    """Wipe hard blocks for (user, date) and re-insert from current
    source data. Idempotent. Soft blocks (kind='soft') are preserved.

    Returns the full list of blocks (hard + soft) for the date,
    ordered by start time.
    """
    blocks = compute_hard_blocks(user_id, date_iso)
    delete_hard_blocks_for_date(user_id, date_iso)
    for b in blocks:
        insert_day_block(
            user_id, date_iso,
            kind="hard",
            block_start=b["block_start"],
            block_end=b["block_end"],
            label=b["label"],
            source_type=b["source_type"],
            source_id=b["source_id"],
            source_json=b["source_json"],
        )
    return list_day_blocks(user_id, date_iso)


def parse_date(date_iso: str | None) -> str:
    """Parse a date string or fall back to today (UTC). Returns 'YYYY-MM-DD'.
    Caller should pass the user's local date when timezone matters; this
    function only validates shape.
    """
    if date_iso:
        try:
            d = date.fromisoformat(date_iso)
            return d.isoformat()
        except ValueError:
            pass
    return date.today().isoformat()
