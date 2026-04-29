import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, LayoutChangeEvent, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  fetchDayTimeline,
  formatBlockTime,
  labelSoftBlocks,
  type DayBlock,
  type DayTimelineResponse,
} from '../../lib/api/timeline';
import { useTokens } from '../../lib/theme';
import { localToday } from '../../lib/localTime';

// App-instance throttle for soft-block labeling — keep it cheap.
// First DayStrip mount fires it; subsequent mounts within the
// session skip. Per-day key so a day-rollover triggers a new pass.
const _lastLabeledForDate: Record<string, number> = {};
const LABEL_THROTTLE_MS = 30 * 60 * 1000; // 30 min

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
  const [selected, setSelected] = useState<DayBlock | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);
  // Track block widths so we can scroll the "now" position into
  // view. Each block's onLayout reports its measured width back here.
  const blockWidths = useRef<Map<number, number>>(new Map());
  // Auto-scroll latch — only the first valid layout triggers a scroll.
  // Must live above the early returns so React's hook order stays stable.
  const scrolledOnceRef = useRef(false);

  // Index of the block that contains "now", or the next future
  // block. Used to auto-scroll on mount + render the "now" line.
  const blocks = data?.blocks ?? [];
  const nowIndex = useMemo(() => {
    const now = new Date();
    let inProgress = -1;
    let nextFuture = -1;
    blocks.forEach((b, i) => {
      const s = new Date(b.block_start);
      const e = new Date(b.block_end);
      if (s <= now && now < e && inProgress === -1) inProgress = i;
      if (s > now && nextFuture === -1) nextFuture = i;
    });
    return inProgress !== -1 ? inProgress : nextFuture;
  }, [blocks]);

  useEffect(() => {
    let cancelled = false;
    const dateIso = localToday();
    setLoading(true);
    setError(null);
    fetchDayTimeline(dateIso)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        // Trigger AI soft-block labeling once per day per session.
        // Fire-and-forget — soft blocks appear on the next refresh,
        // but the initial render still shows hard blocks immediately.
        // Cron-driven nightly labeling is the post-launch optimization.
        const last = _lastLabeledForDate[dateIso] ?? 0;
        if (Date.now() - last > LABEL_THROTTLE_MS) {
          _lastLabeledForDate[dateIso] = Date.now();
          labelSoftBlocks(dateIso)
            .then((labeled) => { if (!cancelled) setData(labeled); })
            .catch(() => { /* swallow — soft blocks are nice-to-have */ });
        }
      })
      .catch((e) => { if (!cancelled) setError((e as Error).message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Scroll to the "now" block once we know its width. Only fires
  // once per data set — subsequent re-renders don't re-scroll.
  useEffect(() => {
    if (scrolledOnceRef.current) return;
    if (nowIndex < 0) return;
    if (blocks.length === 0) return;
    // Wait one tick so onLayout has had a chance to fire.
    const id = setTimeout(() => {
      const widths = blockWidths.current;
      if (widths.size < Math.min(nowIndex + 1, blocks.length)) return;
      let offset = 0;
      for (let i = 0; i < nowIndex; i++) {
        offset += (widths.get(blocks[i].id) ?? 200) + 10; // +10 ≈ scroller gap
      }
      // Pull the now block ~16px from the left edge so the indicator
      // line is visible against the previous block.
      offset = Math.max(0, offset - 16);
      scrollRef.current?.scrollTo({ x: offset, animated: true });
      scrolledOnceRef.current = true;
    }, 100);
    return () => clearTimeout(id);
  }, [nowIndex, blocks]);

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
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scroller}>
          {blocks.map((b, i) => (
            <View
              key={b.id}
              style={styles.blockSlot}
              onLayout={(e: LayoutChangeEvent) => {
                blockWidths.current.set(b.id, e.nativeEvent.layout.width);
              }}>
              <BlockCard block={b} onPress={() => setSelected(b)} />
              {i === nowIndex ? (
                <View
                  pointerEvents="none"
                  style={[styles.nowLine, { backgroundColor: t.danger }]}
                />
              ) : null}
            </View>
          ))}
        </ScrollView>
      )}

      <BlockDetailSheet block={selected} onClose={() => setSelected(null)} />
    </View>
  );
}

function BlockCard({ block, onPress }: { block: DayBlock; onPress: () => void }) {
  const t = useTokens();
  const accent = colorForBlock(block, t);
  const timeRange = `${formatBlockTime(block.block_start)} – ${formatBlockTime(block.block_end)}`;
  const subtitle = block.source?.location
    ? String(block.source.location)
    : block.source_type === 'gcal' || block.source_type === 'outlook'
      ? sourceLabel(block.source_type)
      : '';
  const isSoft = block.kind === 'soft';
  // Confidence pill — only on soft blocks. Maps 0..1 to Low/Med/High
  // so it's glanceable without exposing arbitrary precision.
  const confLabel = isSoft && block.confidence != null
    ? block.confidence >= 0.8 ? 'high'
      : block.confidence >= 0.55 ? 'med'
      : 'low'
    : null;

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.block,
        {
          // Soft blocks get a lighter background tint so they read
          // as inferred-not-authoritative even before confidence
          // is parsed. Hard blocks use the normal bg.
          backgroundColor: isSoft ? t.surface : t.bg,
          borderColor: isSoft ? t.subtle : t.border,
          borderStyle: isSoft ? 'dashed' : 'solid',
          opacity: isSoft ? 0.92 : 1,
        },
      ]}>
      <View style={[styles.blockBar, { backgroundColor: accent }]} />
      <View style={styles.blockBody}>
        <Text style={[styles.blockTime, { color: t.muted }]} numberOfLines={1}>
          {timeRange}
        </Text>
        <Text
          style={[
            styles.blockLabel,
            { color: t.text, fontStyle: isSoft ? 'italic' : 'normal' },
          ]}
          numberOfLines={2}>
          {capitalize(block.label || 'Untitled')}
        </Text>
        {subtitle && !isSoft ? (
          <Text style={[styles.blockSub, { color: t.subtle }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
        {confLabel ? (
          <View style={[styles.confPill, { borderColor: t.subtle }]}>
            <Text style={[styles.confText, { color: t.subtle }]}>
              AI · {confLabel}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

function capitalize(s: string): string {
  if (!s) return s;
  return s[0].toUpperCase() + s.slice(1);
}

/** Tap-a-block detail sheet. Pulled out as a centered modal because
 *  the full-screen ChatOverlay-style sheet pattern is already
 *  reserved for the FAB; a smaller modal keeps Day Timeline drilldown
 *  feeling lightweight. */
function BlockDetailSheet({ block, onClose }: {
  block: DayBlock | null;
  onClose: () => void;
}) {
  const t = useTokens();
  if (!block) return null;
  const isSoft = block.kind === 'soft';
  const accent = colorForBlock(block, t);
  const range = `${formatBlockTime(block.block_start)} – ${formatBlockTime(block.block_end)}`;
  const durationMin = (() => {
    const s = new Date(block.block_start);
    const e = new Date(block.block_end);
    return Math.max(0, Math.round((e.getTime() - s.getTime()) / 60000));
  })();
  const src = block.source ?? {};

  // Detail rows depending on block kind/source.
  const rows: { label: string; value: string }[] = [];
  rows.push({ label: 'When', value: range });
  rows.push({ label: 'Duration', value: `${durationMin} min` });
  if (block.source_type) {
    rows.push({ label: 'Source', value: sourceLabel(block.source_type) });
  }
  if (src.location) {
    rows.push({ label: 'Location', value: String(src.location) });
  }
  if (typeof src.attendees_count === 'number' && src.attendees_count > 0) {
    rows.push({ label: 'Attendees', value: String(src.attendees_count) });
  }
  if (isSoft && block.confidence != null) {
    rows.push({
      label: 'AI confidence',
      value: `${Math.round(block.confidence * 100)}%`,
    });
  }

  return (
    <Modal
      visible={!!block}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable
          style={[styles.modalCard, { backgroundColor: t.surface, borderColor: t.border }]}
          onPress={(e) => e.stopPropagation()}>
          <View style={styles.modalHeader}>
            <View style={[styles.modalIcon, { backgroundColor: accent + '22' }]}>
              <Ionicons
                name={iconForBlock(block)}
                size={18}
                color={accent}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.modalKicker, { color: t.muted }]}>
                {isSoft ? 'AI-LABELED' : (block.source_type || '').toUpperCase()}
              </Text>
              <Text style={[styles.modalTitle, { color: t.text }]} numberOfLines={2}>
                {capitalize(block.label || 'Untitled')}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={20} color={t.muted} />
            </Pressable>
          </View>

          {rows.map((r) => (
            <View key={r.label} style={[styles.modalRow, { borderTopColor: t.border }]}>
              <Text style={[styles.modalRowLabel, { color: t.muted }]}>{r.label}</Text>
              <Text style={[styles.modalRowValue, { color: t.text }]} numberOfLines={2}>
                {r.value}
              </Text>
            </View>
          ))}

          {isSoft ? (
            <Text style={[styles.modalFootnote, { color: t.subtle }]}>
              AI inferred this block from your day's context. Hard
              blocks (calendar events, tasks with times) are
              authoritative.
            </Text>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function iconForBlock(b: DayBlock): React.ComponentProps<typeof Ionicons>['name'] {
  if (b.kind === 'soft') {
    const lbl = (b.label || '').toLowerCase();
    if (lbl.includes('focus'))    return 'hourglass-outline';
    if (lbl.includes('meeting'))  return 'people-outline';
    if (lbl.includes('meal'))     return 'restaurant-outline';
    if (lbl.includes('transit'))  return 'car-outline';
    if (lbl.includes('exercise')) return 'barbell-outline';
    if (lbl.includes('social'))   return 'chatbubbles-outline';
    if (lbl.includes('leisure'))  return 'ice-cream-outline';
    if (lbl.includes('errand'))   return 'cart-outline';
    if (lbl.includes('sleep'))    return 'moon-outline';
    return 'help-circle-outline';
  }
  switch (b.source_type) {
    case 'gcal':    return 'calendar-outline';
    case 'outlook': return 'mail-open-outline';
    case 'task':    return 'checkbox-outline';
    case 'sleep':   return 'moon-outline';
    default:        return 'time-outline';
  }
}

function colorForBlock(b: DayBlock, t: ReturnType<typeof useTokens>): string {
  if (b.kind === 'soft') {
    // Soft blocks color by inferred label. Default lookup; falls back
    // to subtle for "unknown".
    const label = (b.label || '').toLowerCase();
    if (label.includes('focus'))    return t.accent;
    if (label.includes('meeting'))  return t.accent;
    if (label.includes('meal'))     return t.cal;
    if (label.includes('exercise')) return t.fitness;
    if (label.includes('transit'))  return t.muted;
    if (label.includes('social'))   return t.fitness;
    if (label.includes('leisure'))  return t.subtle;
    if (label.includes('errand'))   return t.muted;
    if (label.includes('sleep'))    return t.muted;
    return t.subtle;
  }
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
  confPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 100,
    borderWidth: 1,
    marginTop: 2,
  },
  confText: { fontSize: 9, fontWeight: '600', letterSpacing: 0.5 },

  // Wrapper around each block + the "now" indicator overlay.
  blockSlot: { position: 'relative' },
  // Vertical red line marking "right now" — overlays on top of the
  // current/next block via positioned absolute. pointerEvents:'none'
  // so it doesn't eat taps from the block underneath.
  nowLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 2,
    borderRadius: 1,
  },

  // Block detail sheet — small centered modal, NOT full-screen.
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    gap: 4,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 12,
  },
  modalIcon: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  modalKicker: {
    fontSize: 9, fontWeight: '700', letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  modalTitle: { fontSize: 16, fontWeight: '700', marginTop: 1 },
  modalRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  modalRowLabel: { fontSize: 12, fontWeight: '600', flex: 1 },
  modalRowValue: { fontSize: 13, fontWeight: '500', flex: 2, textAlign: 'right' },
  modalFootnote: { fontSize: 11, marginTop: 12, lineHeight: 16, fontStyle: 'italic' },
});
