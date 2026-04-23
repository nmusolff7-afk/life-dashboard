import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { useTokens } from '../../lib/theme';

interface Props {
  caloriesConsumed: number;
  caloriesBurned: number;
  /** Projected TDEE / RMR. When provided, used as the burn figure in the equation
   *  (matching Flask: "tdee - consumed"). When absent, falls back to caloriesBurned. */
  projectedBurn?: number | null;
  onPress?: () => void;
}

const RING_SIZE = 180;
const R = 50;
const CIRC = 2 * Math.PI * R; // 314.159...

/** Mirrors Flask .dash-ring-wrap + equation. Green for deficit, red for surplus. */
export function TodayBalanceCard({ caloriesConsumed, caloriesBurned, projectedBurn }: Props) {
  const t = useTokens();
  const burn = projectedBurn ?? caloriesBurned;
  const balance = burn - caloriesConsumed;
  const isDeficit = balance >= 0;
  const hasData = caloriesConsumed > 0 || burn > 0;

  const mainColor = !hasData ? t.muted : isDeficit ? t.green : t.danger;
  const label = !hasData ? '—' : isDeficit ? 'deficit' : 'surplus';
  const valueText = !hasData ? '—' : String(Math.abs(Math.round(balance)));

  // Ring fill: fraction of burn that calories-eaten covers (0..1), or full ring on surplus.
  const pct = !hasData ? 0 : isDeficit ? Math.min(1, caloriesConsumed / Math.max(burn, 1)) : 1;
  const dash = CIRC * pct;

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
            stroke={mainColor}
            strokeWidth={14}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${CIRC}`}
            rotation={-90}
            origin="60, 60"
          />
        </Svg>
        <View style={styles.ringCenter} pointerEvents="none">
          <Text style={[styles.ringValue, { color: mainColor }]}>{valueText}</Text>
          <Text style={[styles.ringLabel, { color: t.muted }]}>{label.toUpperCase()}</Text>
        </View>
      </View>

      {hasData ? (
        <View style={styles.eqRow}>
          <Text style={[styles.eqStrong, { color: t.text }]}>{Math.round(burn)}</Text>
          <Text style={[styles.eqDim, { color: t.muted }]}> burn </Text>
          <Text style={[styles.eqStrong, { color: t.text }]}>−</Text>
          <Text style={[styles.eqStrong, { color: t.text }]}> {Math.round(caloriesConsumed)}</Text>
          <Text style={[styles.eqDim, { color: t.muted }]}> eaten </Text>
          <Text style={[styles.eqStrong, { color: t.text }]}>= </Text>
          <Text style={[styles.eqStrong, { color: mainColor }]}>
            {Math.abs(Math.round(balance))}
          </Text>
          <Text style={[styles.eqDim, { color: t.muted }]}> {label}</Text>
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
