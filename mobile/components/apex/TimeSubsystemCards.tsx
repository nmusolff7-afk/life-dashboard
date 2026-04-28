import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type {
  GcalEvent, GcalStatusResponse, GmailEmail, GmailStatusResponse,
  OutlookEmail, OutlookStatusResponse,
} from '../../lib/hooks/useTimeData';
import { syncGmailNow } from '../../lib/hooks/useTimeData';
import { syncGcal } from '../../lib/hooks/useGcalOAuth';
import { syncOutlook } from '../../lib/hooks/useOutlookOAuth';
import { useTokens } from '../../lib/theme';

// ── Gmail summary card ──────────────────────────────────────────────────

export function GmailSummaryCard({
  status,
  loading,
  onChanged,
}: {
  status: GmailStatusResponse | null;
  loading: boolean;
  onChanged: () => void;
}) {
  const t = useTokens();
  const [syncing, setSyncing] = useState(false);

  if (loading && !status) {
    return (
      <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
        <ActivityIndicator color={t.accent} />
      </View>
    );
  }
  if (!status?.connected) {
    return (
      <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border, opacity: 0.85 }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: t.text }]}>Email</Text>
          <View style={[styles.pill, { borderColor: t.border }]}>
            <Text style={[styles.pillText, { color: t.subtle }]}>Not connected</Text>
          </View>
        </View>
        <Text style={[styles.sub, { color: t.muted }]}>
          Connect Gmail in Settings → Connections for inbox triage and the Today's Focus list.
        </Text>
      </View>
    );
  }

  const summary = status.summary;
  const totalCached = status.emails?.length ?? 0;
  const allEmails = status.emails ?? [];
  const importantEmails = status.important ?? [];

  // Pick what to show as preview rows: prefer important emails (user
  // has explicitly labeled the senders), fall back to most-recent
  // unread, fall back to most-recent overall. Always show 3 — empty
  // inbox is a real signal.
  const unreplied = allEmails.filter((e) => !e.is_read && !e.has_replied);
  const previewSource = importantEmails.length
    ? importantEmails
    : unreplied.length
      ? unreplied
      : allEmails;
  const preview = previewSource.slice(0, 3);

  const onSync = async () => {
    setSyncing(true);
    try { await syncGmailNow(); onChanged(); }
    catch (e) { console.warn('Gmail sync failed:', (e as Error).message); }
    finally { setSyncing(false); }
  };

  return (
    <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: t.text }]}>📧 Email</Text>
        <Pressable onPress={onSync} disabled={syncing} hitSlop={10}>
          <Text style={[styles.linkText, { color: t.accent, opacity: syncing ? 0.5 : 1 }]}>
            {syncing ? 'Syncing…' : 'Sync now'}
          </Text>
        </Pressable>
      </View>
      <Text style={[styles.sub, { color: t.subtle }]} numberOfLines={1}>
        {status.email}
      </Text>

      {/* AI summary first when present — that's the strongest signal. */}
      {summary?.summary_text ? (
        <Text style={[styles.summaryText, { color: t.text }]} numberOfLines={6}>
          {summary.summary_text}
        </Text>
      ) : null}

      {/* Email previews — always show what's actually in the inbox. */}
      {preview.length > 0 ? (
        <>
          <Text style={[styles.bucketLabel, { color: t.muted }]}>
            {importantEmails.length ? 'Important' : unreplied.length ? 'Unread' : 'Recent'}
          </Text>
          {preview.map((e) => <GmailEmailRow key={e.message_id} email={e} />)}
        </>
      ) : !summary?.summary_text ? (
        <Text style={[styles.summaryEmpty, { color: t.muted }]}>
          No emails cached yet. Pull-to-refresh or tap Sync now.
        </Text>
      ) : null}

      <View style={styles.statsRow}>
        <Stat label="Unreplied" value={summary?.unreplied ?? unreplied.length} accent={t.accent} muted={t.muted} />
        <Stat label="Important" value={importantEmails.length} accent={t.accent} muted={t.muted} />
        <Stat label="Cached" value={totalCached} accent={t.accent} muted={t.muted} />
      </View>
    </View>
  );
}

function GmailEmailRow({ email }: { email: GmailEmail }) {
  const t = useTokens();
  const isUnread = !email.is_read;
  // Either Gmail's native IMPORTANT label OR a user-defined
  // importance score makes this row important. Surfaces as a star
  // icon next to the subject — INBOX 2026-04-28 founder asked
  // "nothing's marked as important right now from emails" before
  // we wired the native flag through.
  const isImportant = !!email.is_important || (email.importance_score ?? 0) > 0;
  const meta = [
    email.sender,
    formatRelative(email.received_at),
  ].filter(Boolean).join(' · ');
  return (
    <View style={styles.emailRow}>
      <View style={[styles.emailDot, {
        backgroundColor: isUnread ? t.accent : 'transparent',
        borderColor: isUnread ? t.accent : t.subtle,
      }]} />
      <View style={{ flex: 1 }}>
        <View style={styles.emailSubjectRow}>
          {isImportant ? (
            <Ionicons name="star" size={11} color="#F59E0B" style={styles.emailStar} />
          ) : null}
          <Text style={[styles.emailSubject, {
            color: t.text,
            fontWeight: isUnread ? '700' : '500',
          }]} numberOfLines={1}>
            {email.subject || '(no subject)'}
          </Text>
        </View>
        <Text style={[styles.emailMeta, { color: t.muted }]} numberOfLines={1}>
          {meta}
        </Text>
        {email.snippet ? (
          <Text style={[styles.emailSnippet, { color: t.subtle }]} numberOfLines={1}>
            {email.snippet}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

// ── Calendar today card ─────────────────────────────────────────────────

export function CalendarTodayCard({
  status,
  loading,
  onChanged,
}: {
  status: GcalStatusResponse | null;
  loading: boolean;
  onChanged: () => void;
}) {
  const t = useTokens();
  const [syncing, setSyncing] = useState(false);

  if (loading && !status) {
    return (
      <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
        <ActivityIndicator color={t.accent} />
      </View>
    );
  }
  if (!status?.connected) {
    return (
      <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border, opacity: 0.85 }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: t.text }]}>Calendar</Text>
          <View style={[styles.pill, { borderColor: t.border }]}>
            <Text style={[styles.pillText, { color: t.subtle }]}>Not connected</Text>
          </View>
        </View>
        <Text style={[styles.sub, { color: t.muted }]}>
          Connect Google Calendar in Settings → Connections for today's events and meeting density.
        </Text>
      </View>
    );
  }

  const events = status.events ?? [];
  const { today, tomorrow } = splitByDay(events);

  const onSync = async () => {
    setSyncing(true);
    try { await syncGcal(); onChanged(); }
    catch (e) { console.warn('Calendar sync failed:', (e as Error).message); }
    finally { setSyncing(false); }
  };

  return (
    <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: t.text }]}>📅 Calendar</Text>
        <Pressable onPress={onSync} disabled={syncing} hitSlop={10}>
          <Text style={[styles.linkText, { color: t.accent, opacity: syncing ? 0.5 : 1 }]}>
            {syncing ? 'Syncing…' : 'Sync now'}
          </Text>
        </Pressable>
      </View>
      <Text style={[styles.sub, { color: t.subtle }]} numberOfLines={1}>
        {status.email || ''}
      </Text>

      <Text style={[styles.bucketLabel, { color: t.muted }]}>Today</Text>
      {today.length === 0 ? (
        <Text style={[styles.summaryEmpty, { color: t.muted }]}>Nothing on the calendar today.</Text>
      ) : (
        today.map((ev) => <EventRow key={ev.event_id} ev={ev} />)
      )}

      {tomorrow.length > 0 ? (
        <>
          <Text style={[styles.bucketLabel, { color: t.muted }]}>Tomorrow</Text>
          {tomorrow.slice(0, 5).map((ev) => <EventRow key={ev.event_id} ev={ev} />)}
        </>
      ) : null}
    </View>
  );
}

// ── Outlook (mail + calendar combined) ──────────────────────────────────

export function OutlookCard({
  status,
  loading,
  onChanged,
}: {
  status: OutlookStatusResponse | null;
  loading: boolean;
  onChanged: () => void;
}) {
  const t = useTokens();
  const [syncing, setSyncing] = useState(false);

  if (loading && !status) {
    return (
      <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
        <ActivityIndicator color={t.accent} />
      </View>
    );
  }
  if (!status?.connected) {
    return (
      <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border, opacity: 0.85 }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: t.text }]}>Outlook</Text>
          <View style={[styles.pill, { borderColor: t.border }]}>
            <Text style={[styles.pillText, { color: t.subtle }]}>Not connected</Text>
          </View>
        </View>
        <Text style={[styles.sub, { color: t.muted }]}>
          Connect Outlook in Settings → Connections for inbox + calendar in one go (Microsoft 365, personal Outlook.com, work email).
        </Text>
      </View>
    );
  }

  const events = status.events ?? [];
  const emails = status.emails ?? [];
  const unread = status.unread_count ?? emails.filter((e) => !e.is_read).length;
  const { today, tomorrow } = splitByDay(events);

  const onSync = async () => {
    setSyncing(true);
    try { await syncOutlook(); onChanged(); }
    catch (e) { console.warn('Outlook sync failed:', (e as Error).message); }
    finally { setSyncing(false); }
  };

  return (
    <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: t.text }]}>📬 Outlook</Text>
        <Pressable onPress={onSync} disabled={syncing} hitSlop={10}>
          <Text style={[styles.linkText, { color: t.accent, opacity: syncing ? 0.5 : 1 }]}>
            {syncing ? 'Syncing…' : 'Sync now'}
          </Text>
        </Pressable>
      </View>
      <Text style={[styles.sub, { color: t.subtle }]} numberOfLines={1}>
        {status.email}
      </Text>

      <Text style={[styles.bucketLabel, { color: t.muted }]}>
        Inbox{unread > 0 ? ` · ${unread} unread` : ''}
      </Text>
      {emails.length === 0 ? (
        <Text style={[styles.summaryEmpty, { color: t.muted }]}>No recent emails cached.</Text>
      ) : (
        emails.slice(0, 3).map((e) => <OutlookEmailRow key={e.message_id} email={e} />)
      )}

      <Text style={[styles.bucketLabel, { color: t.muted }]}>Today's events</Text>
      {today.length === 0 ? (
        <Text style={[styles.summaryEmpty, { color: t.muted }]}>Nothing on the Outlook calendar today.</Text>
      ) : (
        today.map((ev) => <EventRow key={ev.event_id} ev={ev} />)
      )}

      {tomorrow.length > 0 ? (
        <>
          <Text style={[styles.bucketLabel, { color: t.muted }]}>Tomorrow</Text>
          {tomorrow.slice(0, 5).map((ev) => <EventRow key={ev.event_id} ev={ev} />)}
        </>
      ) : null}
    </View>
  );
}

function OutlookEmailRow({ email }: { email: OutlookEmail }) {
  const t = useTokens();
  const isUnread = !email.is_read;
  const meta = [
    email.sender,
    formatRelative(email.received_at),
  ].filter(Boolean).join(' · ');
  return (
    <View style={styles.emailRow}>
      <View style={[styles.emailDot, {
        backgroundColor: isUnread ? t.accent : 'transparent',
        borderColor: isUnread ? t.accent : t.subtle,
      }]} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.emailSubject, {
          color: t.text,
          fontWeight: isUnread ? '700' : '500',
        }]} numberOfLines={1}>
          {email.subject || '(no subject)'}
        </Text>
        <Text style={[styles.emailMeta, { color: t.muted }]} numberOfLines={1}>
          {meta}
        </Text>
        {email.snippet ? (
          <Text style={[styles.emailSnippet, { color: t.subtle }]} numberOfLines={1}>
            {email.snippet}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function EventRow({ ev }: { ev: GcalEvent }) {
  const t = useTokens();
  const time = formatEventTime(ev);
  const meta = [
    time,
    ev.location || '',
    ev.attendees_count > 1 ? `${ev.attendees_count} attendees` : '',
  ].filter(Boolean).join(' · ');
  return (
    <View style={styles.eventRow}>
      <Ionicons name="ellipse" size={6} color={t.accent} style={{ marginTop: 7 }} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.eventTitle, { color: t.text }]} numberOfLines={1}>{ev.title}</Text>
        {meta ? <Text style={[styles.eventMeta, { color: t.muted }]} numberOfLines={1}>{meta}</Text> : null}
      </View>
    </View>
  );
}

function Stat({ label, value, accent, muted }: { label: string; value: number; accent: string; muted: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color: accent }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: muted }]}>{label}</Text>
    </View>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────

function splitByDay(events: GcalEvent[]): { today: GcalEvent[]; tomorrow: GcalEvent[] } {
  const todayIso = localDateIso(0);
  const tomorrowIso = localDateIso(1);
  const today: GcalEvent[] = [];
  const tomorrow: GcalEvent[] = [];
  for (const ev of events) {
    const day = ev.all_day ? ev.start_iso.slice(0, 10) : ev.start_iso.slice(0, 10);
    if (day === todayIso) today.push(ev);
    else if (day === tomorrowIso) tomorrow.push(ev);
  }
  return { today, tomorrow };
}

function localDateIso(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatEventTime(ev: GcalEvent): string {
  if (ev.all_day) return 'All day';
  try {
    const start = new Date(ev.start_iso);
    return start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

function formatRelative(iso: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso).getTime();
    if (isNaN(d)) return '';
    const diffMin = Math.round((Date.now() - d) / 60000);
    if (diffMin < 1)   return 'just now';
    if (diffMin < 60)  return `${diffMin}m ago`;
    if (diffMin < 1440) return `${Math.round(diffMin / 60)}h ago`;
    return `${Math.round(diffMin / 1440)}d ago`;
  } catch {
    return '';
  }
}

// ── Styles ──────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 6 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 14, fontWeight: '700' },
  sub: { fontSize: 11 },
  pill: { borderWidth: 1, borderRadius: 100, paddingVertical: 3, paddingHorizontal: 10 },
  pillText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  summaryText: { fontSize: 13, lineHeight: 18, marginTop: 4 },
  summaryEmpty: { fontSize: 12, fontStyle: 'italic', marginTop: 4 },
  linkText: { fontSize: 12, fontWeight: '600' },

  statsRow: { flexDirection: 'row', gap: 16, marginTop: 8 },
  stat: { alignItems: 'center', minWidth: 60 },
  statValue: { fontSize: 18, fontWeight: '800' },
  statLabel: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 2 },

  bucketLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 8 },
  eventRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', paddingVertical: 4 },
  eventTitle: { fontSize: 13, fontWeight: '600' },
  eventMeta: { fontSize: 11, marginTop: 1 },

  emailRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 6 },
  emailDot: { width: 8, height: 8, borderRadius: 4, borderWidth: 1.5, marginTop: 6 },
  emailSubjectRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  emailStar: { marginTop: 1 },
  emailSubject: { fontSize: 13, flex: 1 },
  emailMeta: { fontSize: 11, marginTop: 1 },
  emailSnippet: { fontSize: 11, marginTop: 2 },
});
