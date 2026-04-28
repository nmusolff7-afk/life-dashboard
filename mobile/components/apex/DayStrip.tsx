import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  fetchDayTimeline,
  formatBlockTime,
  type DayBlock,
  type DayTimelineResponse,
} from '../../lib/api/timeline';
import { useTokens } from '../../lib/theme';
import { localToday } from '../../lib/localTime';

/** Day strip on the Today tab — horizontal scrollable list of the
 *  current day's blocks (calendar events, sleep sessions, etc).
 *
 *  v1 (§14.2 hard blocks): deterministic blocks only — gcal +
 *  outlook events. Soft-block AI labeling (§14.2.2) will fill the
 *  gaps between hard blocks with labels like "Focus work · 0.85".
 *
 *  The component is intentionally lo-fi (no SVG / no chart lib): each
 *  block is a card pill with a left vertical color bar (kind/source-
 *  driven), the time range, and the label. Matches the app's
 *  View-based viz aesthetic.
 */
export function DayStrip() {
  const t = useTokens();
  const [data, setData] = useState<DayTimelineResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const dateIso = localToday();
    setLoading(true);
    setError(null);
    fetchDayTimeline(dateIso)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError((e as Error).message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Header always shown so the section exists even on empty days.
  const header = (
    <View style={styles.header}>
      <Text style={[styles.title, { color: t.text }]}>Today's timeline</Text>
      <Text style={[styles.sub, { color: t.subtle }]}>
        {data?.blocks?.length ?? 0} block{(data?.blocks?.length ?? 0) === 1 ? '' : 's'}
      </Text>
    </View>
  );

  if (loading && !data) {
    return (
      <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
        {header}
        <ActivityIndicator color={t.accent} style={{ paddingVertical: 16 }} />
      </View>
    );
  }

  if (error && !data) {
    return (
      <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
        {header}
        <Text style={[styles.empty, { color: t.muted }]}>
          Couldn&apos;t load today&apos;s timeline. Pull to refresh.
        </Text>
      </View>
    );
  }

  const blocks = data?.blocks ?? [];

  return (
    <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
      {header}
      {blocks.length === 0 ? (
        <Text style={[styles.empty, { color: t.muted }]}>
          No calendar events today. Connect Google Calendar or Outlook
          in Settings → Connections to populate this strip.
        </Text>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scroller}>
          {blocks.map((b) => (
            <BlockCard key={b.id} block={b} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function BlockCard({ block }: { block: DayBlock }) {
  const t = useTokens();
  const accent = colorForBlock(block, t);
  const timeRange = `${formatBlockTime(block.block_start)} – ${formatBlockTime(block.block_end)}`;
  const subtitle = block.source?.location
    ? String(block.source.location)
    : block.source_type === 'gcal' || block.source_type === 'outlook'
      ? sourceLabel(block.source_type)
      : '';

  return (
    <Pressable style={[styles.block, { backgroundColor: t.bg, borderColor: t.border }]}>
      <View style={[styles.blockBar, { backgroundColor: accent }]} />
      <View style={styles.blockBody}>
        <Text style={[styles.blockTime, { color: t.muted }]} numberOfLines={1}>
          {timeRange}
        </Text>
        <Text style={[styles.blockLabel, { color: t.text }]} numberOfLines={2}>
          {block.label || 'Untitled'}
        </Text>
        {subtitle ? (
          <Text style={[styles.blockSub, { color: t.subtle }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function colorForBlock(b: DayBlock, t: ReturnType<typeof useTokens>): string {
  if (b.kind === 'soft') return t.subtle;
  switch (b.source_type) {
    case 'gcal':    return t.accent;
    case 'outlook': return t.fitness;  // distinct from gcal
    case 'sleep':   return t.muted;
    case 'task':    return t.cal;
    default:        return t.accent;
  }
}

function sourceLabel(s: string): string {
  switch (s) {
    case 'gcal':    return 'Google Calendar';
    case 'outlook': return 'Outlook';
    case 'sleep':   return 'Sleep';
    case 'task':    return 'Task';
    default:        return s;
  }
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 14,
    gap: 10,
  },
  header: {
    paddingHorizontal: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  title: { fontSize: 14, fontWeight: '700' },
  sub: { fontSize: 11, fontWeight: '500' },
  empty: { fontSize: 12, paddingHorizontal: 14, paddingVertical: 8, lineHeight: 17 },
  scroller: { paddingHorizontal: 14, gap: 10 },
  block: {
    flexDirection: 'row',
    minWidth: 180,
    maxWidth: 240,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  blockBar: { width: 4, alignSelf: 'stretch' },
  blockBody: { flex: 1, paddingVertical: 10, paddingHorizontal: 12, gap: 2 },
  blockTime: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  blockLabel: { fontSize: 13, fontWeight: '600', lineHeight: 17 },
  blockSub: { fontSize: 11 },
});
