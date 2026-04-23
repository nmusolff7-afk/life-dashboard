import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { useTokens } from '../../lib/theme';

interface Props {
  caloriesConsumed: number;
  /** Daily calorie target (from goal_targets.calorie_target, falls back to
   *  daily_calorie_goal). Ring progress is consumed / this. */
  calorieTarget?: number | null;
  /** Projected burn — Total Daily Energy Expenditure. Used in the equation
   *  row below the ring. */
  tdee?: number | null;
}

const RING_SIZE = 180;
const R = 50;
const CIRC = 2 * Math.PI * R; // 314.159...

/** Ports Flask #dash-cal-card. Ring tracks consumption vs target; center
 *  shows cals-left or over-target; equation row shows tdee − eaten.
 *  (Flask logic: templates/index.html around line 9500.) */
export function TodayBalanceCard({ caloriesConsumed, calorieTarget, tdee }: Props) {
  const t = useTokens();
  const consumed = Math.max(0, caloriesConsumed);
  const target = calorieTarget ?? 0;
  const burn = tdee ?? 0;
  const hasData = consumed > 0 || burn > 0;

  // Ring: fraction of target consumed.
  const pct = target > 0 ? Math.min(1, consumed / target) : 0;
  const dash = CIRC * pct;
  const remaining = target - consumed; // + = cals left; − = over target

  // Ring color follows Flask's traffic-light (on remaining, not the deficit).
  const ringColor = !hasData
    ? t.surface2
    : remaining > 0
      ? t.green
      : remaining > -200
        ? t.amber
        : t.danger;

  // Center value: cals left (good), over target (bad), or — (no data yet).
  let centerValue = '—';
  let centerLabel = 'balance';
  let centerColor = t.muted;
  if (hasData && target > 0) {
    if (remaining >= 0) {
      centerValue = Math.round(remaining).toLocaleString();
      centerLabel = 'cals left';
      centerColor = t.green;
    } else {
      centerValue = Math.round(Math.abs(remaining)).toLocaleString();
      centerLabel = 'over target';
      centerColor = t.danger;
    }
  }

  // Equation: burn − eaten = deficit or surplus (independent of ring).
  const actualDeficit = burn - consumed;
  const isDeficit = actualDeficit >= 0;
  const equationColor = isDeficit ? t.green : t.danger;

  return (
    <View style={[styles.card, { backgroundColor: t.surface, shadowColor: '#000' }]}>
      <Text style={[styles.cardTitle, { color: t.muted }]}>Today's balance</Text>

      <View style={styles.ringWrap}>
        <Svg width={RING_SIZE} height={RING_SIZE} viewBox="0 0 120 120">
          <Circle cx={60} cy={60} r={R} fill="none" stroke={t.surface2} strokeWidth={14} />
          <Circle
            cx={60}
            cy={60}
            r={R}
            fill="none"
            stroke={ringColor}
            strokeWidth={14}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${CIRC}`}
            rotation={-90}
            origin="60, 60"
          />
        </Svg>
        <View style={styles.ringCenter} pointerEvents="none">
          <Text style={[styles.ringValue, { color: centerColor }]}>{centerValue}</Text>
          <Text style={[styles.ringLabel, { color: t.muted }]}>{centerLabel.toUpperCase()}</Text>
        </View>
      </View>

      {hasData ? (
        <View style={styles.eqRow}>
          <Text style={[styles.eqStrong, { color: t.text }]}>{Math.round(burn).toLocaleString()}</Text>
          <Text style={[styles.eqDim, { color: t.muted }]}> burn </Text>
          <Text style={[styles.eqStrong, { color: t.text }]}>−</Text>
          <Text style={[styles.eqStrong, { color: t.text }]}> {Math.round(consumed).toLocaleString()}</Text>
          <Text style={[styles.eqDim, { color: t.muted }]}> eaten </Text>
          <Text style={[styles.eqStrong, { color: t.text }]}>= </Text>
          <Text style={[styles.eqStrong, { color: equationColor }]}>
            {Math.abs(Math.round(actualDeficit)).toLocaleString()}
          </Text>
          <Text style={[styles.eqDim, { color: t.muted }]}> {isDeficit ? 'deficit' : 'surplus'}</Text>
        </View>
      ) : (
        <Text style={[styles.meta, { color: t.muted }]}>Log meals to see your balance</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: 20,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1.1,
    marginBottom: 10,
  },
  ringWrap: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignSelf: 'center',
    marginVertical: 8,
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
  ringValue: { fontSize: 36, fontWeight: '700', lineHeight: 38, letterSpacing: -0.7 },
  ringLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 1.2, marginTop: 4 },
  eqRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    flexWrap: 'wrap',
    marginTop: 6,
  },
  eqStrong: { fontSize: 13, fontWeight: '600' },
  eqDim: { fontSize: 13 },
  meta: { fontSize: 13, textAlign: 'center', marginTop: 4 },
});
