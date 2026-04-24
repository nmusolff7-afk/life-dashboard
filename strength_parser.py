"""Strength-set extraction from free-text workout descriptions.

Parses lines like:
    "bench press 3x8 @ 185"
    "squats 5x5 at 225 lbs"
    "3 sets of 10 pushups"
    "overhead press 4x6 @ 95, tricep pushdowns 3x12 @ 50"

Returns a list of structured sets suitable for the strength_sets table.
Pure functions — no I/O — so the parser is easy to test and safe to call
from both the live log-workout endpoint and the one-shot backfill job.

Design trade-offs:
- Regex-based, deliberately conservative. If we can't confidently parse,
  we return an empty list and let the caller mark the row `parse_status =
  'unparsed'` so the user can clean it up later.
- No exercise-library lookup at v1. Exercise name is the raw substring;
  normalization (mapping "OHP" → "overhead press" etc.) is a later polish.
- Cardio-only workouts (e.g. "30 min run", "5k jog") return [] and are
  marked 'unparsed' — they don't belong in strength_sets.
"""
from __future__ import annotations

import re
from typing import TypedDict


class ParsedSet(TypedDict):
    exercise_name: str
    set_number: int
    weight_lbs: float | None
    reps: int
    rpe: float | None


# Patterns that strongly indicate cardio rather than strength, skipping the
# line entirely. Ordered by specificity.
_CARDIO_HINTS = re.compile(
    r"\b(\d+\s*(?:k|km|mi|mile|miles)|"
    r"\d+\s*min(?:ute)?s?\s+(?:run|jog|bike|swim|row|walk|hike|elliptical|cardio)|"
    r"(?:ran|jogged|walked|biked|swam|rowed|hiked)\b|"
    r"treadmill|bike ride|peloton|cycling|zone\s*[12345])",
    re.IGNORECASE,
)

# Primary pattern — `exercise {sets}x{reps} [@|at] {weight}[lbs|kg] [@ RPE{n}]`
# Examples matched:
#   "bench press 3x8 @ 185"
#   "squats 5x5 at 225 lbs"
#   "OHP 4x6 @ 95 RPE 8.5"
_SETS_X_REPS = re.compile(
    r"""(?P<name>[A-Za-z][A-Za-z0-9\- ]+?)
        \s+                                     # gap between name and sets
        (?P<sets>\d+)\s*[x×]\s*(?P<reps>\d+)    # NxM
        (?:\s*(?:@|at)\s*(?P<weight>\d+(?:\.\d+)?)(?P<unit>\s*(?:lbs?|kg))?)?  # optional @ weight
        (?:\s*(?:@|,)?\s*rpe\s*(?P<rpe>\d+(?:\.\d+)?))?  # optional RPE
    """,
    re.IGNORECASE | re.VERBOSE,
)

# Secondary pattern — `{sets} sets of {reps} {exercise}` (no weight given)
#   "3 sets of 10 pushups"
#   "4 sets of 12 bodyweight squats"
_SETS_OF_REPS = re.compile(
    r"""(?P<sets>\d+)\s*sets?\s+of\s+(?P<reps>\d+)\s+(?P<name>[A-Za-z][A-Za-z0-9\- ]+)""",
    re.IGNORECASE | re.VERBOSE,
)


def _clean_name(raw: str) -> str:
    """Trim, collapse whitespace, strip trailing commas/conjunctions."""
    name = re.sub(r"\s+", " ", raw).strip()
    name = re.sub(r"^(?:and|then|&)\s+", "", name, flags=re.IGNORECASE)
    name = name.rstrip(",;:—-").strip()
    return name


def parse_strength_description(description: str) -> list[ParsedSet]:
    """Parse a free-text workout description into structured sets.

    Returns [] for pure cardio, empty/garbled input, or anything the parser
    can't confidently decode. An empty list is the "flag for review" signal.
    """
    if not description or not description.strip():
        return []

    text = description.strip()

    # Bail on clearly cardio-only rows
    if _CARDIO_HINTS.search(text) and not _SETS_X_REPS.search(text):
        return []

    # Split on common separators (commas, newlines, semicolons, "then").
    # Keeps multi-exercise sessions parseable in one pass.
    chunks = re.split(r"[,;\n]+|\bthen\b|\band then\b", text, flags=re.IGNORECASE)

    results: list[ParsedSet] = []
    for chunk in chunks:
        chunk = chunk.strip()
        if not chunk:
            continue

        parsed = _parse_chunk(chunk)
        results.extend(parsed)

    return results


def _parse_chunk(chunk: str) -> list[ParsedSet]:
    """Try each pattern in priority order. First match wins per chunk."""
    # Primary: `name NxM @ weight`
    m = _SETS_X_REPS.search(chunk)
    if m:
        return _expand_match(
            name=m.group("name"),
            sets=int(m.group("sets")),
            reps=int(m.group("reps")),
            weight_s=m.group("weight"),
            unit=m.group("unit"),
            rpe_s=m.group("rpe"),
        )

    # Secondary: `N sets of M name`
    m = _SETS_OF_REPS.search(chunk)
    if m:
        return _expand_match(
            name=m.group("name"),
            sets=int(m.group("sets")),
            reps=int(m.group("reps")),
            weight_s=None,
            unit=None,
            rpe_s=None,
        )

    return []


def _expand_match(
    *,
    name: str,
    sets: int,
    reps: int,
    weight_s: str | None,
    unit: str | None,
    rpe_s: str | None,
) -> list[ParsedSet]:
    """Fan out an NxM match into N per-set rows.

    Future improvement: different reps per set (e.g. "5,5,3,3,1") — the
    primary regex doesn't capture this, so we flatten to equal-reps for now.
    """
    if sets <= 0 or sets > 20 or reps <= 0 or reps > 500:
        return []  # clearly garbled — don't pollute the table

    name = _clean_name(name)
    if not name:
        return []

    weight: float | None = None
    if weight_s:
        try:
            w = float(weight_s)
            if unit and "kg" in unit.lower():
                w = w * 2.20462  # canonical storage is lbs
            weight = round(w, 1) if w > 0 else None
        except ValueError:
            weight = None

    rpe: float | None = None
    if rpe_s:
        try:
            r = float(rpe_s)
            if 1.0 <= r <= 10.0:
                rpe = r
        except ValueError:
            rpe = None

    return [
        {
            "exercise_name": name,
            "set_number": i + 1,
            "weight_lbs": weight,
            "reps": reps,
            "rpe": rpe,
        }
        for i in range(sets)
    ]


def estimate_session_volume(sets: list[ParsedSet]) -> float:
    """Total-weight-lifted proxy for Strength weekly volume scoring (§9.10.1).

    volume_lbs = Σ(weight × reps) for sets with weight; bodyweight sets
    contribute 0 (v1 simplification — PRD may refine to body-weight-proxy
    later).
    """
    total = 0.0
    for s in sets:
        if s["weight_lbs"]:
            total += s["weight_lbs"] * s["reps"]
    return round(total, 1)
