import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { useTokens } from '../../lib/theme';

interface Props {
  caloriesConsumed: number;
  caloriesBurned: number;
  calorieTarget?: number | null;
}

const RING_SIZE = 220;
const R = 50;
const CIRC = 2 * Math.PI * R;

/** Full-width donut showing consumed / target, with red overflow when the
 *  user goes over. Center reads "remaining" or "over by" with the target
 *  caption below, and three mini-stats (Consumed · Burned · Net) underneath. */
export function CalorieRingCard({ caloriesConsumed, caloriesBurned, calorieTarget }: Props) {
  const t = useTokens();
  const consumed = Math.max(0, caloriesConsumed);
  const burned = Math.max(0, caloriesBurned);
  const target = calorieTarget ?? 0;
  const hasTarget = target > 0;
  const remaining = target - consumed;
  const over = hasTarget && consumed > target;

  // Main arc (orange progress up to target).
  const mainDash = hasTarget ? CIRC * Math.min(1, consumed / target) : 0;
  // Overflow arc (red portion past target), clamped to one revolution so
  // we don't double-draw on 3x+.
  const overflowDash = over ? CIRC * Math.min(1, (consumed - target) / target) : 0;

  const big = !hasTarget
    ? '—'
    : over
      ? `${Math.round(Math.abs(remaining)).toLocaleString()}`
      : `${Math.round(remaining).toLocaleString()}`;
  const bigColor = !hasTarget ? t.muted : over ? t.danger : t.text;
  const topLabel = !hasTarget ? 'log meals' : over ? 'over' : 'remaining';

  const net = consumed - burned;

  return (
    <View style={[styles.card, { backgroundColor: t.surface, shadowColor: '#000' }]}>
      <View style={styles.ringWrap}>
        <Svg width={RING_SIZE} height={RING_SIZE} viewBox="0 0 120 120">
          {/* Grey track */}
          <Circle cx={60} cy={60} r={R} fill="none" stroke={t.surface2} strokeWidth={12} />
          {/* Main orange (or green-on-hit) arc */}
          {hasTarget ? (
            <Circle
              cx={60}
              cy={60}
              r={R}
              fill="none"
              stroke={t.cal}
              strokeWidth={12}
              strokeLinecap="round"
              strokeDasharray={`${mainDash} ${CIRC}`}
              rotation={-90}
              origin="60, 60"
            />
          ) : null}
          {/* Red overflow, overlaid starting at 12 o'clock. */}
          {over ? (
            <Circle
              cx={60}
              cy={60}
              r={R}
              fill="none"
              stroke={t.danger}
              strokeWidth={12}
              strokeLinecap="round"
              strokeDasharray={`${overflowDash} ${CIRC}`}
              rotation={-90}
              origin="60, 60"
            />
          ) : null}
        </Svg>

        <View style={styles.ringCenter} pointerEvents="none">
          <Text style={[styles.bigValue, { color: bigColor }]}>{big}</Text>
          <Text style={[styles.bigLabel, { color: t.muted }]}>{topLabel.toUpperCase()}</Text>
          {hasTarget ? (
            <Text style={[styles.bigTarget, { color: t.subtle }]}>
              of {target.toLocaleString()} target
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.miniRow}>
        <MiniStat label="Consumed" value={consumed} color={t.cal} />
        <View style={[styles.miniDivider, { backgroundColor: t.border }]} />
        <MiniStat label="Burned" value={burned} color={t.fitness} />
        <View style={[styles.miniDivider, { backgroundColor: t.border }]} />
        <MiniStat
          label="Net"
          value={net}
          color={net <= (target || Infinity) ? t.text : t.danger}
        />
      </View>
    </View>
  );
}

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  const t = useTokens();
  return (
    <View style={styles.mini}>
      <Text style={[styles.miniValue, { color }]}>
        {Math.round(value).toLocaleString()} <Text style={[styles.miniUnit, { color: t.muted }]}>kcal</Text>
      </Text>
      <Text style={[styles.miniLabel, { color: t.muted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: 20,
    gap: 14,
    alignItems: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 3,
  },
  ringWrap: {
    width: RING_SIZE,
    height: RING_SIZE,
  },
  ringCenter: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigValue: { fontSize: 42, fontWeight: '700', lineHeight: 44, letterSpacing: -1 },
  bigLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 1.2, marginTop: 2 },
  bigTarget: { fontSize: 11, marginTop: 4 },

  miniRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    marginTop: 4,
  },
  mini: { flex: 1, alignItems: 'center', gap: 2 },
  miniDivider: { width: 1, height: 28 },
  miniValue: { fontSize: 14, fontWeight: '700' },
  miniUnit: { fontSize: 10, fontWeight: '500' },
  miniLabel: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 },
});
