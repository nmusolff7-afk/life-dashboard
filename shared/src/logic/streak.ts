/**
 * Streak calculation — count consecutive logged days walking backward from today.
 * Port of index.html's inline streak loop.
 *
 * A day is "logged" if any meaningful interaction happened:
 *   calories > 0 OR weight present OR steps > 0 OR deficit != null
 */

export interface DailyEntry {
  calories?: number;
  weight?: number | null;
  steps?: number;
  /** Non-null means deficit was computed for the day. */
  deficit?: number | null;
}

export interface StreakInput {
  /** YYYY-MM-DD → entry. Missing keys are treated as unlogged. */
  dailyLog: Record<string, DailyEntry | undefined>;
  /** Today's date, YYYY-MM-DD. Streak counts back from here. */
  today: string;
}

/** Matches the isLogged() predicate in index.html (v1.18 definition). */
export function isLogged(entry: DailyEntry | undefined): boolean {
  if (!entry) return false;
  return (
    (entry.calories !== undefined && entry.calories > 0) ||
    entry.weight != null ||
    (entry.steps !== undefined && entry.steps > 0) ||
    (entry.deficit !== undefined && entry.deficit !== null)
  );
}

function subDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - n);
  return dt.toISOString().slice(0, 10);
}

/** Count consecutive logged days ending at today (inclusive if today is logged, exclusive otherwise). */
export function computeStreak(input: StreakInput): number {
  const todayLogged = isLogged(input.dailyLog[input.today]);
  const startOffset = todayLogged ? 0 : 1;
  let streak = 0;
  const MAX = 10000; // safety cap (~27 years) to prevent infinite loops on malformed input
  for (let i = startOffset; i < MAX; i++) {
    const d = subDays(input.today, i);
    if (isLogged(input.dailyLog[d])) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}
