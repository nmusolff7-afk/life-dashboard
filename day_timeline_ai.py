"""Day Timeline — AI-labeled soft-block gap inference.

Per PRD §4.6.5 (revised 2026-04-28; see BUILD_PLAN.md → Vision → PRD
overrides). Day Timeline is a two-tier model:

- **Hard blocks** (`day_timeline.py`): deterministic from calendar
  events + tasks-with-time. Reproducible.
- **Soft blocks** (this module): AI-labeled inference for the gaps
  between hard blocks. Claude Haiku reads HC activity + screen-time
  top-app + location-cluster context for each unaccounted hour-range
  and returns a label ("focus work", "transit", "meal", etc.) plus a
  confidence score.

Labels are clearly distinguished from hard blocks in the UI (lighter
treatment, "soft" tag) and the user can dismiss / re-label any soft
block. Per PRD §3.3, AI here is descriptive only — it narrates what
already happened, not what the user should do.

Public API:
- `label_soft_blocks(user_id, date_iso)` — wipe-and-replace soft
  blocks for the date. Returns the inserted rows.

Cost: ~1 Haiku call per labeling run with ~3-6 gaps batched into a
single prompt. Well under a penny per day per user.
"""

from __future__ import annotations

import json as _json
import logging as _logging
import uuid
from datetime import datetime, timedelta

from db import (
    delete_soft_blocks_for_date,
    get_conn,
    insert_day_block,
    list_day_blocks,
)

_log = _logging.getLogger(__name__)

# Minimum gap length to bother labeling. Gaps shorter than this are
# noise; we leave them empty.
_MIN_GAP_MINUTES = 25

# Maximum gaps to send to Haiku in one call. If a day has more, we
# only label the longest N — the rest stay unlabeled.
_MAX_GAPS_PER_CALL = 8


def label_soft_blocks(user_id: int, date_iso: str) -> list[dict]:
    """Compute + persist AI-labeled soft blocks for the date.
    Wipe-and-replace pattern: existing kind='soft' rows for the date
    are deleted before insert. Hard blocks are NOT touched."""
    # Find hard blocks first — soft blocks fill the gaps between them.
    hard = [b for b in list_day_blocks(user_id, date_iso) if b.get("kind") == "hard"]
    gaps = _gaps_between_hard_blocks(date_iso, hard)
    gaps = [g for g in gaps if _gap_minutes(g) >= _MIN_GAP_MINUTES]
    gaps.sort(key=lambda g: _gap_minutes(g), reverse=True)
    gaps = gaps[:_MAX_GAPS_PER_CALL]

    if not gaps:
        delete_soft_blocks_for_date(user_id, date_iso)
        return []

    # Gather context for each gap — single DB pass per source.
    context = _gather_context(user_id, date_iso)
    enriched = [
        {
            "start": g["start"],
            "end":   g["end"],
            "minutes": _gap_minutes(g),
            **_context_for_window(g["start"], g["end"], context),
        }
        for g in gaps
    ]

    # Single Haiku call labels all gaps.
    try:
        labels = _label_via_haiku(enriched)
    except Exception:
        _log.exception("day_timeline_ai: Haiku labeling failed")
        return []

    # Wipe and re-insert.
    delete_soft_blocks_for_date(user_id, date_iso)
    for gap, lbl in zip(enriched, labels):
        insert_day_block(
            user_id, date_iso,
            kind="soft",
            block_start=gap["start"],
            block_end=gap["end"],
            label=lbl.get("label") or "Unaccounted",
            confidence=float(lbl.get("confidence") or 0.0),
            source_type="soft_ai",
            # UUID per soft block — uniqueness only matters for the
            # ON CONFLICT path of insert_day_block, which keys on
            # (user_id, block_date, source_type, source_id).
            source_id=str(uuid.uuid4()),
            source_json=_json.dumps({
                "context_hint": gap.get("context_hint", ""),
                "model":        "claude-haiku-4-5",
                "labeled_at":   datetime.now().isoformat(),
            }),
        )

    return [b for b in list_day_blocks(user_id, date_iso) if b.get("kind") == "soft"]


def _gaps_between_hard_blocks(date_iso: str, hard: list[dict]) -> list[dict]:
    """Compute the unaccounted hour-ranges between hard blocks. Only
    covers waking hours (06:00 → 22:00) by default — labeling sleep
    isn't useful (dedicated sleep blocks land via §14.5.2)."""
    # Sort by start.
    spans = sorted(
        ((b["block_start"], b["block_end"]) for b in hard),
        key=lambda p: p[0],
    )
    day_start = f"{date_iso}T06:00:00"
    day_end = f"{date_iso}T22:00:00"
    cursor = day_start
    gaps: list[dict] = []
    for s, e in spans:
        # Trim to the day window.
        if e <= cursor:
            continue
        if s > cursor:
            gap_end = min(s, day_end)
            if gap_end > cursor:
                gaps.append({"start": cursor, "end": gap_end})
        cursor = max(cursor, e)
        if cursor >= day_end:
            break
    if cursor < day_end:
        gaps.append({"start": cursor, "end": day_end})
    return gaps


def _gap_minutes(gap: dict) -> int:
    try:
        s = datetime.fromisoformat(gap["start"])
        e = datetime.fromisoformat(gap["end"])
        return max(0, int((e - s).total_seconds() // 60))
    except Exception:
        return 0


def _gather_context(user_id: int, date_iso: str) -> dict:
    """Pull the connector data needed to inform soft-block labels.
    One DB query per source, all bounded to the date. Returns a dict
    with `screen_apps`, `location_clusters`, `health` keys."""
    out: dict = {"screen_apps": [], "location_samples": [], "health": None}
    with get_conn() as conn:
        # Screen Time top apps for the day. The top_apps_json blob is
        # `[{package, label, minutes}]` if present — we just want the
        # package + minutes for context.
        try:
            row = conn.execute(
                "SELECT total_minutes, top_apps_json FROM screen_time_daily "
                "WHERE user_id = ? AND stat_date = ?",
                (user_id, date_iso),
            ).fetchone()
            if row and row["top_apps_json"]:
                try:
                    out["screen_apps"] = _json.loads(row["top_apps_json"]) or []
                except Exception:
                    out["screen_apps"] = []
                out["screen_total_minutes"] = int(row["total_minutes"] or 0)
        except Exception:
            pass

        # Location samples (with nearest cluster) for the day. We don't
        # have minute-precise clusters per sample, so we pass the raw
        # sample list keyed by 30-min buckets and let the prompt
        # interpret.
        try:
            rows = conn.execute(
                "SELECT lat, lon, sampled_at FROM location_samples "
                "WHERE user_id = ? AND substr(sampled_at, 1, 10) = ? "
                "ORDER BY sampled_at",
                (user_id, date_iso),
            ).fetchall()
            out["location_samples"] = [dict(r) for r in rows]
        except Exception:
            pass

        # Cluster names — to translate sample lat/lon into "home" /
        # "gym" / etc. Only the top few by dwell.
        try:
            rows = conn.execute(
                "SELECT id, centroid_lat, centroid_lon, place_name, place_label "
                "FROM location_clusters WHERE user_id = ? "
                "ORDER BY total_dwell_minutes DESC LIMIT 6",
                (user_id,),
            ).fetchall()
            out["clusters"] = [dict(r) for r in rows]
        except Exception:
            out["clusters"] = []

        # Health daily totals — broad context (steps + active kcal
        # signal whether the user was moving).
        try:
            row = conn.execute(
                "SELECT steps, active_kcal, sleep_minutes FROM health_daily "
                "WHERE user_id = ? AND stat_date = ?",
                (user_id, date_iso),
            ).fetchone()
            if row:
                out["health"] = dict(row)
        except Exception:
            pass

    return out


def _context_for_window(start_iso: str, end_iso: str, ctx: dict) -> dict:
    """Distill the day-level context down to what's relevant for ONE
    gap window. Mostly: which clusters did the user visit during this
    window (rough — sample-by-sample). Other signals are day-level so
    we attach a `context_hint` string the prompt can read."""
    try:
        s = datetime.fromisoformat(start_iso)
        e = datetime.fromisoformat(end_iso)
    except Exception:
        return {"context_hint": ""}

    # Find samples in window, then nearest cluster per sample.
    in_window = []
    for s_row in ctx.get("location_samples") or []:
        try:
            t = datetime.fromisoformat(s_row["sampled_at"].replace("Z", "+00:00")).replace(tzinfo=None)
        except Exception:
            continue
        if s <= t <= e:
            in_window.append(s_row)

    def _nearest_cluster_label(lat: float, lon: float) -> str | None:
        import math as _math
        best_label = None
        best_dist = 9e9
        for c in ctx.get("clusters") or []:
            clat = float(c.get("centroid_lat") or 0)
            clon = float(c.get("centroid_lon") or 0)
            d = ((clat - lat) ** 2 + (clon - lon) ** 2) ** 0.5
            if d < best_dist:
                best_dist = d
                best_label = c.get("place_name") or c.get("place_label") or None
        # Roughly < ~150m. Don't speculate beyond that.
        return best_label if best_dist < 0.0015 else None

    visited_labels: list[str] = []
    for s_row in in_window:
        lbl = _nearest_cluster_label(float(s_row["lat"]), float(s_row["lon"]))
        if lbl and lbl not in visited_labels:
            visited_labels.append(lbl)

    # Day-level signals attached as a hint string (Haiku reads it
    # alongside the gap range).
    apps_top = (ctx.get("screen_apps") or [])[:5]
    apps_str = ", ".join(
        f"{a.get('label') or a.get('package')}:{int(a.get('minutes') or 0)}m"
        for a in apps_top if a
    )
    health = ctx.get("health") or {}
    hint_bits = []
    if visited_labels:
        hint_bits.append(f"visited: {', '.join(visited_labels)}")
    if apps_str:
        hint_bits.append(f"day's top apps: {apps_str}")
    if health.get("steps"):
        hint_bits.append(f"day's steps: {health['steps']}")
    return {"context_hint": " | ".join(hint_bits)}


def _label_via_haiku(gaps: list[dict]) -> list[dict]:
    """Send all gaps in one Haiku call. Returns a list of
    {label, confidence} dicts, one per input gap, in the same order."""
    if not gaps:
        return []
    from ai_client import get_client
    client = get_client()

    gaps_text = "\n".join(
        f"{i+1}. {_fmt_time(g['start'])}–{_fmt_time(g['end'])} "
        f"({g['minutes']}min) | context: {g.get('context_hint') or '(none)'}"
        for i, g in enumerate(gaps)
    )
    system = (
        "You label time-windows in a user's day with short descriptive "
        "tags based on context. Always pick from this short vocabulary "
        "when possible: focus, meeting, meal, transit, exercise, social, "
        "leisure, errand, sleep, unknown. If multiple fit, pick the most "
        "specific. NEVER suggest what the user should do — only describe "
        "what likely happened. Reply with strict JSON only."
    )
    user = (
        f"Label these {len(gaps)} time windows. Reply with a JSON object "
        f"shaped {{\"labels\": [{{\"label\": \"<word>\", \"confidence\": "
        f"<0..1>}}, ...]}} — exactly {len(gaps)} entries, in order.\n\n"
        f"{gaps_text}"
    )
    resp = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=600,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    text = "".join(b.text for b in resp.content if hasattr(b, "text")).strip()
    # Strip a leading ```json fence if present.
    if text.startswith("```"):
        text = text.strip("`")
        if text.startswith("json"):
            text = text[4:]
        text = text.strip()
    try:
        parsed = _json.loads(text)
    except Exception:
        _log.exception("day_timeline_ai: Haiku returned non-JSON: %s", text[:200])
        return [{"label": "unknown", "confidence": 0.0} for _ in gaps]

    out = parsed.get("labels") if isinstance(parsed, dict) else None
    if not isinstance(out, list) or len(out) != len(gaps):
        _log.warning("day_timeline_ai: Haiku label count mismatch (got %s wanted %s)",
                     len(out) if isinstance(out, list) else "?", len(gaps))
        return [{"label": "unknown", "confidence": 0.0} for _ in gaps]
    return out


def _fmt_time(iso: str) -> str:
    try:
        dt = datetime.fromisoformat(iso)
        return dt.strftime("%H:%M")
    except Exception:
        return iso[:16]
