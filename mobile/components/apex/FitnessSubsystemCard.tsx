import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { SubsystemScore } from '../../../shared/src/types/score';
import { useHaptics } from '../../lib/useHaptics';
import { useTokens } from '../../lib/theme';
import { ScoreArc } from './ScoreArc';

interface Props {
  subsystem: SubsystemScore;
  /** Route to the subsystem's detail screen. */
  href: Href;
  /** Optional one-line status beneath the label — typically derived by the
   *  parent from that subsystem's signals (e.g. "7,432 steps today"). */
  hint?: string | null;
  /** Optional icon name — parent picks based on subsystem key. */
  icon?: React.ComponentProps<typeof Ionicons>['name'];
}

/** Two-line card for each Fitness subsystem on the Today tab. Shows
 *  subsystem score + filled score arc on the right, name + hint on the
 *  left. Tap drills into the subsystem detail screen. */
export function FitnessSubsystemCard({ subsystem, href, hint, icon = 'ellipse-outline' }: Props) {
  const t = useTokens();
  const haptics = useHaptics();
  const router = useRouter();
  const hasScore = subsystem.score != null;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        haptics.fire('tap');
        router.push(href);
      }}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: t.surface,
          borderColor: t.border,
          transform: [{ scale: pressed ? 0.99 : 1 }],
          opacity: pressed ? 0.92 : 1,
        },
      ]}>
      <View style={[styles.iconWrap, { backgroundColor: t.surface2 }]}>
        <Ionicons name={icon} size={18} color={t.fitness} />
      </View>
      <View style={styles.middle}>
        <Text style={[styles.label, { color: t.text }]}>{subsystem.label}</Text>
        {hint ? (
          <Text style={[styles.hint, { color: t.muted }]} numberOfLines={1}>
            {hint}
          </Text>
        ) : null}
      </View>
      <View style={styles.right}>
        <Text style={[styles.score, { color: hasScore ? t.text : t.muted }]}>
          {hasScore ? String(subsystem.score) : '—'}
        </Text>
        <ScoreArc
          score={hasScore ? subsystem.score : null}
          band={subsystem.band}
          size={18}
          stroke={2.5}
        />
      </View>
      <Ionicons name="chevron-forward" size={16} color={t.subtle} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  middle: { flex: 1, gap: 2 },
  label: { fontSize: 14, fontWeight: '600' },
  hint: { fontSize: 11 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  score: { fontSize: 20, fontWeight: '700', letterSpacing: -0.4 },
});
