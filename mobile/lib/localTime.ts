/**
 * Local-time helpers. Ported from templates/index.html localToday() /
 * localNow() so Flask receives a real local calendar-day + timestamp on
 * every log. Without these, Flask falls back to server UTC (Railway) and
 * workouts/meals land on the wrong day / wrong hour — which breaks meal-
 * window scoring, day-boundary streaks, and displayed log times.
 *
 * Precedence: user's explicit timezone (set in Settings → Preferences)
 * wins over the device's intrinsic timezone. Fallback chain is:
 *   1. AsyncStorage-stored timezone (future hookup — not wired yet)
 *   2. Intl.DateTimeFormat().resolvedOptions().timeZone (device default)
 *   3. UTC as last resort (should never hit)
 */

/**
 * Returns today's date as YYYY-MM-DD in the user's local timezone.
 * Suitable for the `client_date` field on log POSTs.
 */
export function localToday(tz?: string): string {
  const zone = tz ?? resolveTimezone();
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const y = parts.find((p) => p.type === 'year')?.value ?? '1970';
    const m = parts.find((p) => p.type === 'month')?.value ?? '01';
    const d = parts.find((p) => p.type === 'day')?.value ?? '01';
    return `${y}-${m}-${d}`;
  } catch {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
}

/**
 * Returns "YYYY-MM-DD HH:MM:SS" for the user's local timezone.
 * Suitable for the `client_time` field on log POSTs.
 */
export function localNow(tz?: string): string {
  const zone = tz ?? resolveTimezone();
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(new Date());
    const v = (t: string) => parts.find((x) => x.type === t)?.value ?? '00';
    return `${v('year')}-${v('month')}-${v('day')} ${v('hour')}:${v('minute')}:${v('second')}`;
  } catch {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return (
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
      `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
    );
  }
}

/** Headers block to spread onto every log POST so Flask uses local time. */
export function clientTimeHeaders(): { 'X-Client-Date': string; 'X-Client-Timezone': string } {
  return {
    'X-Client-Date': localToday(),
    'X-Client-Timezone': resolveTimezone(),
  };
}

/** Body fields to include on log POSTs so Flask stores local-time timestamps. */
export function clientTimeFields(): { client_date: string; client_time: string } {
  return {
    client_date: localToday(),
    client_time: localNow(),
  };
}

function resolveTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz || 'UTC';
  } catch {
    return 'UTC';
  }
}
