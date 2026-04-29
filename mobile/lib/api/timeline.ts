import { apiFetch } from '../api';

/** A single block on the day timeline.
 *
 *  `kind`:
 *    - 'hard'  → deterministic, from a calendar event / task / sleep
 *      session. Reproducible.
 *    - 'soft'  → AI-labeled gap inference (§14.2.2; not shipped yet).
 *      Carries a `confidence` score.
 *
 *  `source_type` identifies the origin: 'gcal' / 'outlook' / 'task' /
 *  'sleep' / 'soft_ai'. UI uses it for color + icon selection.
 *  `source` is the parsed source_json — title, location, attendees,
 *  etc., depending on type.
 */
export interface DayBlock {
  id: number;
  block_start: string;          // ISO timestamp
  block_end: string;            // ISO timestamp
  kind: 'hard' | 'soft';
  label: string | null;
  confidence: number | null;    // 0..1, soft blocks only
  source_type: string | null;
  source: {
    title?: string;
    location?: string | null;
    attendees_count?: number;
    html_link?: string | null;
    event_id?: string;
    provider?: string;
    [key: string]: unknown;
  } | null;
}

export interface DayTimelineResponse {
  date: string;                 // YYYY-MM-DD
  blocks: DayBlock[];
}

/** Fetch the day's timeline. Server recomputes hard blocks on read in
 *  v1 — cheap (<50 events typical). Pass the user's local date as
 *  `YYYY-MM-DD` to match same-day boundary semantics. */
export async function fetchDayTimeline(dateIso: string): Promise<DayTimelineResponse> {
  const res = await apiFetch(`/api/day-timeline/${encodeURIComponent(dateIso)}`);
  if (!res.ok) {
    let detail = '';
    try {
      const body = (await res.json()) as { error?: string; detail?: string };
      detail = body.detail || body.error || '';
    } catch { /* ignore */ }
    throw new Error(`day-timeline ${dateIso} → ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  return (await res.json()) as DayTimelineResponse;
}

/** Trigger AI soft-block labeling for a date. Wipes existing
 *  `kind='soft'` rows + re-inserts based on Claude Haiku's read of
 *  the gaps. Returns the full block list. ~1s round-trip; throttle
 *  in the caller (one labeling pass per day per app-instance is
 *  plenty). */
export async function labelSoftBlocks(dateIso: string): Promise<DayTimelineResponse> {
  const res = await apiFetch(`/api/day-timeline/${encodeURIComponent(dateIso)}/label-soft`, {
    method: 'POST',
  });
  if (!res.ok) {
    throw new Error(`label-soft ${dateIso} → ${res.status}`);
  }
  return (await res.json()) as DayTimelineResponse;
}

/** Format an ISO timestamp as 'h:mma' in the device's local timezone.
 *  Used by DayStrip to label blocks. */
export function formatBlockTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const hours24 = d.getHours();
  const minutes = d.getMinutes();
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const ampm = hours24 < 12 ? 'a' : 'p';
  const mm = minutes === 0 ? '' : `:${String(minutes).padStart(2, '0')}`;
  return `${hours12}${mm}${ampm}`;
}
