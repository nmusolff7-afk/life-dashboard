/**
 * Client-side strength parsing — mirrors the server-side strength_parser.py
 * enough to power display without a round-trip. Used by the Strength
 * subsystem detail screen to classify sessions and estimate volume.
 *
 * These helpers are display-only. Authoritative parsing + storage happens
 * server-side via insert_workout → save_strength_sets.
 */

const STRENGTH_HINTS = /\b(bench|squat|deadlift|press|row|pull-?up|chin-?up|push-?up|curl|lunge|dip|lift|lifted|reps?|sets?|\d+\s*x\s*\d+|\d+\s*lbs?|\d+\s*kg)\b/i;
const CARDIO_HINTS = /\b(\d+\s*(?:mi|mile|miles|km)|run|jog|bike|swim|row|treadmill|cycling|peloton|zone\s*\d)\b/i;

export function classifyAsStrength(description: string): boolean {
  const d = description.toLowerCase();
  if (CARDIO_HINTS.test(d) && !STRENGTH_HINTS.test(d)) return false;
  return STRENGTH_HINTS.test(d);
}

const SETS_REPS_AT = /(\d+)\s*x\s*(\d+)(?:\s*(?:@|at)\s*(\d+(?:\.\d+)?)(?:\s*(kg|lbs?))?)?/gi;
const SETS_OF_REPS = /(\d+)\s*sets?\s+of\s+(\d+)/gi;

export interface ParsedStrength {
  totalSets: number;
  topWeight: number;
  estimatedVolume: number; // Σ sets × reps × weight (lbs)
}

export function parseDescription(description: string): ParsedStrength {
  let totalSets = 0;
  let topWeight = 0;
  let volume = 0;

  const matches = Array.from(description.matchAll(SETS_REPS_AT));
  for (const m of matches) {
    const sets = parseInt(m[1] || '0', 10);
    const reps = parseInt(m[2] || '0', 10);
    const rawWeight = m[3] ? parseFloat(m[3]) : 0;
    const unit = m[4] ?? '';
    const weightLbs = unit.toLowerCase().startsWith('kg')
      ? Math.round(rawWeight * 2.20462 * 10) / 10
      : rawWeight;
    if (sets > 0 && sets < 20 && reps > 0 && reps < 500) {
      totalSets += sets;
      if (weightLbs > topWeight) topWeight = weightLbs;
      volume += sets * reps * weightLbs;
    }
  }

  if (totalSets === 0) {
    const of = Array.from(description.matchAll(SETS_OF_REPS));
    for (const m of of) {
      const sets = parseInt(m[1] || '0', 10);
      if (sets > 0 && sets < 20) totalSets += sets;
    }
  }

  return { totalSets, topWeight, estimatedVolume: Math.round(volume) };
}

export function strength_weekly_volume_label(thisWeek: number, avg: number): string {
  if (thisWeek <= 0) return 'No strength volume this week yet';
  if (avg <= 0) return 'Building your baseline';
  const pct = Math.round(((thisWeek - avg) / avg) * 100);
  if (pct >= 10) return `+${pct}% vs your 8-week average`;
  if (pct <= -10) return `${pct}% vs your 8-week average`;
  return 'On pace with your 8-week average';
}
