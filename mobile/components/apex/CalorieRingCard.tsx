import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import type { ScoreBand } from '../../../shared/src/types/score';
import { useTokens } from '../../lib/theme';

interface Props {
  /** Calories logged today. */
  totalIntake: number;
  /** Live TDEE — RMR + NEAT + EAT + TEF. Null until profile loads. */
  totalBurn: number | null;
  /** Goal intake = totalBurn + deficitSurplus. Null until profile loads. */
  goalIntake: number | null;
  /** Nutrition score to surface as a compact pill at the top-right of
   *  the card. Lets Nutrition Today retain the score without stacking
   *  another big hero next to the ring. Null hides the pill. */
  score?: number | null;
  scoreBand?: ScoreBand;
}

const RING_SIZE = 220;
const R = 50;
const CIRC = 2 * Math.PI * R;

/** Donut: totalIntake / goalIntake. Center reads distance-to-goal
 *  ("X cals left" or "X over"). Three mini-stats below — Intake · Burn ·
 *  Net — where Burn is the live totalBurn (RMR+NEAT+EAT+TEF, never just
 *  workout calories) and Net is totalBurn − totalIntake (current actual
 *  deficit/surplus). RMR/NEAT/EAT/TEF individually live only in Settings. */
export function CalorieRingCard({ totalIntake, totalBurn, goalIntake, score, scoreBand }: Props) {
  const t = useTokens();
  const bandColor =
    scoreBand === 'green' ? t.green
      : scoreBand === 'amber' ? t.amber
      : scoreBand === 'red' ? t.danger
      : t.muted;
  const intake = Math.max(0, totalIntake);
  const burn = totalBurn ?? 0;
  const goal = goalIntake ?? 0;
  const hasGoal = goal > 0;
  const distanceToGoal = goal - intake; // positive = cals left, negative = over
  const over = hasGoal && intake > goal;

  const mainDash = hasGoal ? CIRC * Math.min(1, intake / goal) : 0;
  const overflowDash = over ? CIRC * Math.min(1, (intake - goal) / goal) : 0;

  // Center reads as a clean "consumed of goal" — the absolute consumed
  // count goes on top so the user sees their actual intake first, with
  // the goal as context underneath. Distance-to-goal lives in a single
  // line below. Previously we showed "1951 cals left / of 1951 goal" at
  // the start of day, which felt redundant (subtraction is implied).
  const big = !hasGoal ? '—' : Math.round(intake).toLocaleString();
  const bigColor = !hasGoal ? t.muted : over ? t.danger : t.text;
  const topLabel = !hasGoal ? 'log meals to start' : 'consumed';
  const remainingValue = hasGoal
    ? over
      ? `${Math.round(Math.abs(distanceToGoal)).toLocaleString()} over goal`
      : `${Math.round(distanceToGoal).toLocaleString()} cals left to goal`
    : null;
  const remainingColor = !hasGoal ? t.muted : over ? t.danger : t.subtle;

  const actualNet = totalBurn != null ? burn - intake : null; // + = current deficit

  return (
    <View style={[styles.card, { backgroundColor: t.surface, shadowColor: '#000' }]}>
      {score != null ? (
        <View style={[styles.scorePill, { backgroundColor: t.surface2 }]}>
          <Text style={[styles.scorePillLabel, { color: t.muted }]}>NUTRITION</Text>
          <Text style={[styles.scorePillValue, { color: t.text }]}>{score}</Text>
          <View style={[styles.scorePillDot, { backgroundColor: bandColor }]} />
        </View>
      ) : null}
      <View style={styles.ringWrap}>
        <Svg width={RING_SIZE} height={RING_SIZE} viewBox="0 0 120 120">
          <Circle cx={60} cy={60} r={R} fill="none" stroke={t.surface2} strokeWidth={12} />
          {hasGoal ? (
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
          {hasGoal ? (
            <>
              <Text style={[styles.bigTarget, { color: t.subtle }]}>
                of {goal.toLocaleString()} goal
              </Text>
              {remainingValue ? (
                <Text style={[styles.remaining, { color: remainingColor }]}>
                  {remainingValue}
                </Text>
              ) : null}
            </>
          ) : null}
        </View>
      </View>

      <View style={styles.miniRow}>
        <MiniStat label="Intake" value={intake} color={t.cal} />
        <View style={[styles.miniDivider, { backgroundColor: t.border }]} />
        <MiniStat label="Burn" value={burn} color={t.fitness} />
        <View style={[styles.miniDivider, { backgroundColor: t.border }]} />
        <NetStat value={actualNet} />
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

function NetStat({ value }: { value: number | null }) {
  const t = useTokens();
  if (value == null) {
    return (
      <View style={styles.mini}>
        <Text style={[styles.miniValue, { color: t.muted }]}>—</Text>
        <Text style={[styles.miniLabel, { color: t.muted }]}>Net</Text>
      </View>
    );
  }
  const deficit = value >= 0;
  const label = deficit ? 'Deficit' : 'Surplus';
  const color = deficit ? t.green : t.amber;
  return (
    <View style={styles.mini}>
      <Text style={[styles.miniValue, { color }]}>
        {Math.round(Math.abs(value)).toLocaleString()} <Text style={[styles.miniUnit, { color: t.muted }]}>kcal</Text>
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
  scorePill: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 100,
    zIndex: 2,
  },
  scorePillLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 0.8 },
  scorePillValue: { fontSize: 14, fontWeight: '700' },
  scorePillDot: { width: 6, height: 6, borderRadius: 3 },

  bigValue: { fontSize: 42, fontWeight: '700', lineHeight: 44, letterSpacing: -1 },
  bigLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 1.2, marginTop: 2 },
  bigTarget: { fontSize: 11, marginTop: 4 },
  remaining: { fontSize: 11, marginTop: 4, fontWeight: '600' },

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
