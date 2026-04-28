import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { apiFetch } from '../../lib/api';
import {
  fetchDayTimeline,
  formatBlockTime,
  type DayBlock,
} from '../../lib/api/timeline';
import { localToday } from '../../lib/localTime';
import { useTokens } from '../../lib/theme';

interface ScreenTimeTodayResponse {
  today: { total_minutes: number } | null;
}

interface LocationTodayResponse {
  visits: { place_name?: string | null; place_label?: string | null }[];
}

/** Time tab Today subtab — content density layer.
 *
 *  Two parts:
 *    - **Day signal chips** — Screen / Places / Focus / Meetings.
 *      Each pulls from an endpoint the Time tab already exposes
 *      separately (LocationCard / ScreenTimeCard / etc) but
 *      rolls them up at the top of the tab so the founder sees
 *      "what's happening today" at a glance, not scrolled-down.
 *    - **Right now / Up next strip** — reads the Day Timeline
 *      and surfaces the in-progress + next block. Tap → routes
 *      to the Timeline subtab for the full strip.
 *
 *  Founder INBOX 2026-04-28: "today's focus maybe should be
 *  summarizing all the data from the time tab it has. Right now
 *  feels empty like it's not doing anything still."
 */
interface Props {
  /** Number of meetings (calendar events, all-day excluded) today.
   *  Computed in time.tsx from gcalStatus + outlookStatus and passed
   *  in so we don't double-fetch. */
  meetingsToday: number;
  /** Total focus-minutes today — sum of calendar events with "focus"
   *  in the title. Same provenance — passed in from parent. */
  focusMinutesToday: number;
  /** Tap a chip → scroll to / open the related section. Passed in
   *  for navigation control. */
  onTimelineTap?: () => void;
}

export function TimeTodaySignals({ meetingsToday, focusMinutesToday, onTimelineTap }: Props) {
  const t = useTokens();
  const [screenMinutes, setScreenMinutes] = useState<number | null>(null);
  const [visitCount, setVisitCount] = useState<number | null>(null);
  const [blocks, setBlocks] = useState<DayBlock[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Screen Time
    apiFetch('/api/screen-time/today')
      .then((r) => r.ok ? r.json() : null)
      .then((j: ScreenTimeTodayResponse | null) => {
        if (!cancelled) setScreenMinutes(j?.today?.total_minutes ?? null);
      })
      .catch(() => { if (!cancelled) setScreenMinutes(null); });
    // Location
    apiFetch('/api/location/today')
      .then((r) => r.ok ? r.json() : null)
      .then((j: LocationTodayResponse | null) => {
        if (!cancelled) setVisitCount(j?.visits?.length ?? null);
      })
      .catch(() => { if (!cancelled) setVisitCount(null); });
    // Day Timeline
    fetchDayTimeline(localToday())
      .then((d) => { if (!cancelled) setBlocks(d.blocks ?? []); })
      .catch(() => { if (!cancelled) setBlocks([]); });
    return () => { cancelled = true; };
  }, []);

  const inProgress = blocks?.find((b) => {
    const now = new Date();
    return new Date(b.block_start) <= now && now < new Date(b.block_end);
  }) ?? null;
  const upNext = blocks?.find((b) => new Date(b.block_start) > new Date()) ?? null;

  const screenLabel = screenMinutes != null
    ? formatHM(screenMinutes)
    : '—';
  const visitsLabel = visitCount != null ? `${visitCount}` : '—';
  const focusLabel = focusMinutesToday > 0 ? formatHM(focusMinutesToday) : '—';
  const meetingsLabel = meetingsToday.toString();

  return (
    <View style={styles.wrap}>
      <View style={styles.chipsRow}>
        <SignalChip icon="phone-portrait-outline" label="Screen" value={screenLabel} t={t} />
        <SignalChip icon="location-outline" label="Places" value={visitsLabel} t={t} />
        <SignalChip icon="hourglass-outline" label="Focus" value={focusLabel} t={t} />
        <SignalChip icon="briefcase-outline" label="Meetings" value={meetingsLabel} t={t} />
      </View>

      {(inProgress || upNext) ? (
        <Pressable
          onPress={onTimelineTap}
          style={({ pressed }) => [
            styles.nowStrip,
            { backgroundColor: t.surface, borderColor: t.border, opacity: pressed ? 0.85 : 1 },
          ]}>
          {inProgress ? (
            <NowRow
              colorAccent={t.accent}
              colorMuted={t.muted}
              colorText={t.text}
              colorSubtle={t.subtle}
              label="In progress"
              block={inProgress}
            />
          ) : null}
          {upNext ? (
            <NowRow
              colorAccent={t.fitness}
              colorMuted={t.muted}
              colorText={t.text}
              colorSubtle={t.subtle}
              label="Up next"
              block={upNext}
              dim={!!inProgress}
            />
          ) : null}
        </Pressable>
      ) : null}
    </View>
  );
}

function SignalChip({ icon, label, value, t }: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string;
  t: ReturnType<typeof useTokens>;
}) {
  return (
    <View style={[styles.chip, { backgroundColor: t.surface, borderColor: t.border }]}>
      <Ionicons name={icon} size={14} color={t.muted} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.chipValue, { color: t.text }]} numberOfLines={1}>{value}</Text>
        <Text style={[styles.chipLabel, { color: t.subtle }]} numberOfLines={1}>{label}</Text>
      </View>
    </View>
  );
}

function NowRow({ label, block, colorAccent, colorMuted, colorText, colorSubtle, dim }: {
  label: string;
  block: DayBlock;
  colorAccent: string;
  colorMuted: string;
  colorText: string;
  colorSubtle: string;
  dim?: boolean;
}) {
  const range = `${formatBlockTime(block.block_start)} – ${formatBlockTime(block.block_end)}`;
  return (
    <View style={[styles.nowRow, { opacity: dim ? 0.6 : 1 }]}>
      <View style={[styles.nowBar, { backgroundColor: colorAccent }]} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.nowKicker, { color: colorMuted }]}>
          {label.toUpperCase()} · {range}
        </Text>
        <Text style={[styles.nowTitle, { color: colorText }]} numberOfLines={1}>
          {block.label || 'Calendar event'}
        </Text>
        {block.source?.location ? (
          <Text style={[styles.nowSub, { color: colorSubtle }]} numberOfLines={1}>
            {String(block.source.location)}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function formatHM(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  chipsRow: { flexDirection: 'row', gap: 8 },
  chip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    minWidth: 0,
  },
  chipValue: { fontSize: 13, fontWeight: '700' },
  chipLabel: { fontSize: 9, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },

  nowStrip: {
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 8,
    gap: 4,
  },
  nowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
    paddingRight: 12,
  },
  nowBar: { width: 3, alignSelf: 'stretch', marginLeft: 12, marginRight: 4 },
  nowKicker: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  nowTitle: { fontSize: 13, fontWeight: '600', marginTop: 1 },
  nowSub: { fontSize: 11, marginTop: 1 },
});
