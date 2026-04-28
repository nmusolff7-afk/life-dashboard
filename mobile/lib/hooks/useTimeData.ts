import { useEffect, useRef } from 'react';

import { apiFetch } from '../api';
import { syncGcal } from './useGcalOAuth';
import { syncOutlook } from './useOutlookOAuth';
import { useApi, type ApiState } from './useApi';

// ── Types ─────────────────────────────────────────────────────────────────

export interface GmailEmail {
  message_id: string;
  thread_id: string;
  sender: string;
  subject: string;
  snippet: string;
  received_at: string;
  is_read: number;
  has_replied: number;
  importance_score?: number;
  /** Gmail's native ML importance flag (the IMPORTANT system label).
   *  Either this or a positive `importance_score` (user-defined rule)
   *  promotes the email into the "important" bucket on the API. */
  is_important?: number;
}

export interface GmailSummary {
  summary_text: string;
  email_count: number;
  unreplied: number;
  generated_at: string;
}

export interface GmailStatusResponse {
  configured: boolean;
  connected: boolean;
  email: string;
  summary: GmailSummary | null;
  emails: GmailEmail[];
  important: GmailEmail[];
  stream: GmailEmail[];
}

export interface GcalEvent {
  user_id: number;
  event_id: string;
  calendar_id: string;
  title: string;
  location: string;
  start_iso: string;
  end_iso: string;
  all_day: number;
  is_self_organizer: number;
  attendees_count: number;
  html_link: string;
  synced_at: string;
}

export interface GcalStatusResponse {
  connected: boolean;
  email?: string;
  last_sync_at?: number;
  events: GcalEvent[];
}

export interface OutlookEmail {
  user_id: number;
  message_id: string;
  thread_id: string;
  sender: string;
  subject: string;
  snippet: string;
  received_at: string;
  is_read: number;
  has_replied: number;
}

export interface OutlookStatusResponse {
  connected: boolean;
  email?: string;
  last_sync_at?: number;
  // Outlook events use the same shape as Gmail/GCal events.
  events: GcalEvent[];
  emails: OutlookEmail[];
  unread_count?: number;
}

// ── Hooks ─────────────────────────────────────────────────────────────────

export const useGmailStatus = (): ApiState<GmailStatusResponse> =>
  useApi<GmailStatusResponse>('/api/gmail/status');

export const useGcalStatus = (): ApiState<GcalStatusResponse> =>
  useApi<GcalStatusResponse>('/api/gcal/status');

export const useOutlookStatus = (): ApiState<OutlookStatusResponse> =>
  useApi<OutlookStatusResponse>('/api/outlook/status');

// ── Mutations ─────────────────────────────────────────────────────────────

/** Trigger a Gmail re-sync — backend pulls fresh emails + regenerates summary. */
export async function syncGmailNow(): Promise<void> {
  const res = await apiFetch('/api/gmail/sync', { method: 'POST' });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error((j as { error?: string }).error || 'Gmail sync failed');
  }
}

// ── Auto-sync on tab focus ────────────────────────────────────────────────

// 90s between auto-syncs per provider. Tightened 2026-04-28 from
// 5min — founder flagged data feeling stale during testing. 90s
// is a balance: live enough for a working session, throttled enough
// to not hammer Gmail / Calendar / Outlook rate limits.
const SYNC_THROTTLE_MS = 90 * 1000;

/** Module-scoped per-provider throttle. Persists across renders + tab
 *  switches within a session so we don't re-fire sync every time the
 *  user briefly leaves and re-enters the Time tab. */
const _lastSync: Record<string, number> = {
  gmail: 0,
  gcal: 0,
  outlook: 0,
};

interface AutoSyncOptions {
  gmail?: boolean;     // default: true if Gmail connected
  gcal?: boolean;
  outlook?: boolean;
  onAfterSync?: () => void;  // called once per cycle after all syncs settle
}

/** Fire background syncs the moment the Time tab gets focus, throttled
 *  so we don't burn rate limits. Each provider checks `_lastSync` and
 *  skips if synced within SYNC_THROTTLE_MS. Failures are swallowed —
 *  cards still render whatever was cached.
 *
 *  Pass `{ gmail: false }` etc to suppress sync when the connector
 *  isn't connected (saves a useless network call that would 401). */
export function useAutoSyncOnFocus(opts: AutoSyncOptions = {}) {
  const { gmail = true, gcal = true, outlook = true, onAfterSync } = opts;
  const onAfterRef = useRef(onAfterSync);
  onAfterRef.current = onAfterSync;

  useEffect(() => {
    let cancelled = false;
    const now = Date.now();
    const tasks: Promise<void>[] = [];

    if (gmail && now - _lastSync.gmail > SYNC_THROTTLE_MS) {
      _lastSync.gmail = now;
      tasks.push(syncGmailNow().catch(() => {/* connector unconnected or transient */}));
    }
    if (gcal && now - _lastSync.gcal > SYNC_THROTTLE_MS) {
      _lastSync.gcal = now;
      tasks.push(syncGcal().then(() => {}).catch(() => {}));
    }
    if (outlook && now - _lastSync.outlook > SYNC_THROTTLE_MS) {
      _lastSync.outlook = now;
      tasks.push(syncOutlook().then(() => {}).catch(() => {}));
    }

    if (tasks.length === 0) return;
    Promise.allSettled(tasks).then(() => {
      if (!cancelled) onAfterRef.current?.();
    });
    return () => { cancelled = true; };
  // Only fires on mount/remount-on-focus; deps frozen by design.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
