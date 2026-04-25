import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Goal, GoalPaceIndicator } from '../../../shared/src/types/goals';
import { useTokens } from '../../lib/theme';

const CATEGORY_EMOJI: Record<string, string> = {
  fitness: '💪',
  nutrition: '🥗',
  finance: '💰',
  time: '⏰',
};

const PACE_COLOR: Record<GoalPaceIndicator, string> = {
  ahead: '#5AB8FF',
  on_track: '#22C55E',
  behind: '#F59E0B',
  neutral: '#9CA3AF',
  paused: '#F97316',
  complete: '#22C55E',
  broken: '#F59E0B',
};

/** Single-row summary of a goal. Used in the Goals list, Home goal strip,
 *  and elsewhere. Tap to open the detail view. */
export function GoalRow({ goal, onPress }: { goal: Goal; onPress: () => void }) {
  const t = useTokens();
  const pct = Math.max(0, Math.min(1, goal.progress_pct ?? 0));
  const pace = goal.pace;
  const paceColor = pace ? PACE_COLOR[pace.indicator] : PACE_COLOR.neutral;
  const primary = !!goal.is_primary;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: t.surface,
          borderColor: primary ? t.accent : t.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}>
      <View style={styles.header}>
        <Text style={styles.emoji}>{CATEGORY_EMOJI[goal.category] ?? '🎯'}</Text>
        <View style={{ flex: 1 }}>
          <Text style={[styles.name, { color: t.text }]} numberOfLines={1}>{goal.display_name}</Text>
          <Text style={[styles.sub, { color: t.muted }]} numberOfLines={1}>
            {primary ? 'Primary · ' : ''}
            {pace?.label || goal.category}
          </Text>
        </View>
        <View style={[styles.pacePill, { backgroundColor: paceColor + '33', borderColor: paceColor }]}>
          <Text style={[styles.paceText, { color: paceColor }]}>{pace?.indicator ?? 'neutral'}</Text>
        </View>
      </View>
      {goal.progress_pct != null && (
        <View style={[styles.progressTrack, { backgroundColor: t.border }]}>
          <View style={[styles.progressFill, { width: `${pct * 100}%`, backgroundColor: paceColor }]} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  emoji: { fontSize: 22 },
  name: { fontSize: 15, fontWeight: '600' },
  sub: { fontSize: 12, marginTop: 2 },
  pacePill: { borderWidth: 1, borderRadius: 100, paddingVertical: 3, paddingHorizontal: 8 },
  paceText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
});
