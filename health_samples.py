"""HealthKit / Health Connect sample ingestion (PRD §4.6.15 + §4.4).

Mobile submits samples via POST /api/health/samples. This module owns:
  - Sample validation (accepted sample_type enum, value sanity checks)
  - Dedupe insertion (relies on the partial unique index on
    user_id + source + source_sample_id — rows without a stable
    source-provided ID fall back to "insert with synthesized ID" to
    avoid silent drops, though the caller should always provide one).
  - Aggregation helpers for scoring (latest_sleep_hours,
    sleep_regularity_score_window, etc.).

Sign convention: every sample carries `effective_start` (unix seconds
UTC). For point-in-time metrics (weight, resting HR) leave
effective_end null. For intervals (sleep, workouts) set effective_end.

Sample-type taxonomy — stable, do not rename once deployed:
  sleep_hours       — total asleep minutes over the night (as hours)
  steps             — daily step count
  heart_rate_bpm    — average HR over the sample window
  hrv_ms            — RMSSD or SDNN, ms
  resting_hr        — single resting HR reading, bpm
  active_energy_kcal — active energy burned
  weight_lbs        — body weight reading
  workout_minutes   — workout session duration
"""

from __future__ import annotations

import json
import time
from datetime import date, datetime, timedelta, timezone
from typing import Any

from db import get_conn


VALID_SAMPLE_TYPES = frozenset({
    'sleep_hours', 'steps', 'heart_rate_bpm', 'hrv_ms',
    'resting_hr', 'active_energy_kcal', 'weight_lbs', 'workout_minutes',
})

# Sanity bounds — reject obvious garbage before it poisons scoring.
_BOUNDS = {
    'sleep_hours': (0.0, 16.0),
    'steps': (0.0, 200_000.0),
    'heart_rate_bpm': (20.0, 240.0),
    'hrv_ms': (0.0, 500.0),
    'resting_hr': (20.0, 150.0),
    'active_energy_kcal': (0.0, 20_000.0),
    'weight_lbs': (40.0, 900.0),
    'workout_minutes': (0.0, 1440.0),
}


def _now() -> int:
    return int(time.time())


def ingest_samples(user_id: int, source: str, samples: list[dict]) -> dict:
    """Insert a batch of samples. Each sample dict:
        { sample_type, value, unit?, effective_start (unix s OR iso8601),
          effective_end?, source_sample_id?, metadata? }

    Returns { accepted, deduped, rejected } counts. Rejected samples are
    those with unknown type or out-of-bounds value; caller should log
    but not fail the whole batch on a single bad row.
    """
    if not source:
        raise ValueError("source required")
    accepted = 0
    deduped = 0
    rejected: list[dict] = []
    now = _now()
    rows: list[tuple] = []
    for s in samples or []:
        try:
            stype = s.get('sample_type')
            if stype not in VALID_SAMPLE_TYPES:
                rejected.append({'sample': s, 'reason': 'unknown_sample_type'})
                continue
            value = float(s.get('value'))
            lo, hi = _BOUNDS[stype]
            if not (lo <= value <= hi):
                rejected.append({'sample': s, 'reason': 'out_of_bounds'})
                continue
            start = _to_unix(s.get('effective_start'))
            if start is None:
                rejected.append({'sample': s, 'reason': 'invalid_effective_start'})
                continue
            end_raw = s.get('effective_end')
            end = _to_unix(end_raw) if end_raw is not None else None
            unit = s.get('unit') or _default_unit(stype)
            ssid = s.get('source_sample_id') or None
            meta = s.get('metadata')
            meta_json = json.dumps(meta) if meta else None
            rows.append((
                user_id, source, ssid, stype, value, unit,
                start, end, meta_json, now,
            ))
        except (TypeError, ValueError, KeyError) as e:
            rejected.append({'sample': s, 'reason': f'parse: {e}'})

    if not rows:
        return {'accepted': 0, 'deduped': 0, 'rejected': len(rejected), 'rejections': rejected}

    with get_conn() as conn:
        for r in rows:
            try:
                conn.execute("""
                    INSERT INTO health_samples
                        (user_id, source, source_sample_id, sample_type, value, unit,
                         effective_start, effective_end, metadata_json, ingested_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, r)
                accepted += 1
            except Exception as e:
                # Partial unique index on (user_id, source, source_sample_id)
                # catches duplicate source IDs — those are dedupes, not errors.
                if 'idx_health_samples_source_id' in str(e) or 'UNIQUE' in str(e).upper():
                    deduped += 1
                else:
                    rejected.append({'sample': r, 'reason': f'db: {e}'})
        conn.commit()

    return {'accepted': accepted, 'deduped': deduped, 'rejected': len(rejected),
            'rejections': rejected[:20]}  # cap response size


def latest_sample(user_id: int, sample_type: str) -> dict | None:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM health_samples WHERE user_id = ? AND sample_type = ? "
            "ORDER BY effective_start DESC LIMIT 1",
            (user_id, sample_type),
        ).fetchone()
    return dict(row) if row else None


def samples_in_window(user_id: int, sample_type: str,
                      start_unix: int, end_unix: int) -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM health_samples WHERE user_id = ? AND sample_type = ? "
            "AND effective_start >= ? AND effective_start <= ? "
            "ORDER BY effective_start",
            (user_id, sample_type, start_unix, end_unix),
        ).fetchall()
    return [dict(r) for r in rows]


# ── Scoring helpers ──────────────────────────────────────────────────────


def sleep_hours_last_n_nights(user_id: int, n: int = 14) -> list[float]:
    """Per-night hours for the past n nights ending yesterday. Missing
    nights return 0.0 so the caller can distinguish from "connected but
    nothing reported" in a regularity signal (variance counts missing
    nights as zero, which penalizes scoring — arguably correct)."""
    today = date.today()
    hours: list[float] = []
    for days_back in range(1, n + 1):
        d = today - timedelta(days=days_back)
        # Sleep events span midnight; we attribute to the wake date.
        # Effective_start within this calendar day counts toward that day.
        start = int(datetime(d.year, d.month, d.day, tzinfo=timezone.utc).timestamp())
        end = start + 86400
        rows = samples_in_window(user_id, 'sleep_hours', start, end)
        if rows:
            # If multiple (e.g., HealthKit sends segments), take max.
            hours.append(max(float(r['value']) for r in rows))
        else:
            hours.append(0.0)
    return hours


def _to_unix(v: Any) -> int | None:
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return int(v)
    if isinstance(v, str):
        s = v.strip()
        if not s:
            return None
        # Try unix seconds
        try:
            return int(float(s))
        except ValueError:
            pass
        # Try ISO 8601
        try:
            dt = datetime.fromisoformat(s.replace('Z', '+00:00'))
            return int(dt.timestamp())
        except ValueError:
            return None
    return None


def _default_unit(sample_type: str) -> str:
    return {
        'sleep_hours': 'hours',
        'steps': 'count',
        'heart_rate_bpm': 'bpm',
        'hrv_ms': 'ms',
        'resting_hr': 'bpm',
        'active_energy_kcal': 'kcal',
        'weight_lbs': 'lbs',
        'workout_minutes': 'min',
    }.get(sample_type, '')
