import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { useTokens } from '../../lib/theme';

interface MacroValues {
  proteinG: number;
  carbsG: number;
  fatG: number;
  sugarG: number;
  fiberG: number;
  sodiumMg: number;
}

interface MacroTargets {
  proteinG?: number | null;
  carbsG?: number | null;
  fatG?: number | null;
  sugarG?: number | null;
  fiberG?: number | null;
  sodiumMg?: number | null;
}

interface Props {
  caloriesConsumed: number;
  /** Daily calorie target. Ring progress is consumed / this. */
  calorieTarget?: number | null;
  /** Projected burn — Total Daily Energy Expenditure. Used in the equation. */
  tdee?: number | null;
  /** Consumed macro / micro totals for today. */
  macroValues: MacroValues;
  /** Daily targets; any null means "no target set" (row still renders). */
  macroTargets?: MacroTargets;
  /** No meals logged today — render the macros tab with em-dashes + hint. */
  empty?: boolean;
}

type Tab = 'balance' | 'macros';

const RING_SIZE = 180;
const R = 50;
const CIRC = 2 * Math.PI * R;

/** Combined Today card with two tabs. Balance tab ports Flask #dash-cal-card
 *  (ring + cals-left center + burn−eaten equation). Macros tab lists all six
 *  macro / micro progress rows in a single scroll — no swipe pager. */
export function TodayBalanceCard({
  caloriesConsumed,
  calorieTarget,
  tdee,
  macroValues,
  macroTargets,
  empty,
}: Props) {
  const t = useTokens();
  const [tab, setTab] = useState<Tab>('balance');

  return (
    <View style={[styles.card, { backgroundColor: t.surface, shadowColor: '#000' }]}>
      <View style={styles.tabs}>
        <TabBtn label="Balance" active={tab === 'balance'} onPress={() => setTab('balance')} />
        <TabBtn label="Macros" active={tab === 'macros'} onPress={() => setTab('macros')} />
      </View>

      {tab === 'balance' ? (
        <BalancePanel
          caloriesConsumed={caloriesConsumed}
          calorieTarget={calorieTarget}
          tdee={tdee}
        />
      ) : (
        <MacrosPanel values={macroValues} targets={macroTargets} empty={empty} />
      )}
    </View>
  );
}

// ─── Tabs ───────────────────────────────────────────────────────────────

function TabBtn({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const t = useTokens();
  return (
    <Pressable onPress={onPress} style={styles.tabBtn}>
      <Text
        style={[
          styles.tabLabel,
          {
            color: active ? t.accent : t.muted,
            fontWeight: active ? '700' : '500',
          },
        ]}>
        {label}
      </Text>
      {active ? <View style={[styles.tabUnderline, { backgroundColor: t.accent }]} /> : null}
    </Pressable>
  );
}

// ─── Balance panel ──────────────────────────────────────────────────────

function BalancePanel({
  caloriesConsumed,
  calorieTarget,
  tdee,
}: Pick<Props, 'caloriesConsumed' | 'calorieTarget' | 'tdee'>) {
  const t = useTokens();
  const consumed = Math.max(0, caloriesConsumed);
  const target = calorieTarget ?? 0;
  const burn = tdee ?? 0;
  const hasData = consumed > 0 || burn > 0;

  const pct = target > 0 ? Math.min(1, consumed / target) : 0;
  const dash = CIRC * pct;
  const remaining = target - consumed;

  const ringColor = !hasData
    ? t.surface2
    : remaining > 0
      ? t.green
      : remaining > -200
        ? t.amber
        : t.danger;

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

  const actualDeficit = burn - consumed;
  const isDeficit = actualDeficit >= 0;
  const equationColor = isDeficit ? t.green : t.danger;

  return (
    <View>
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
          <Text style={[styles.eqStrong, { color: t.text }]}>
            {Math.round(burn).toLocaleString()}
          </Text>
          <Text style={[styles.eqDim, { color: t.muted }]}> burn </Text>
          <Text style={[styles.eqStrong, { color: t.text }]}>−</Text>
          <Text style={[styles.eqStrong, { color: t.text }]}>
            {' '}
            {Math.round(consumed).toLocaleString()}
          </Text>
          <Text style={[styles.eqDim, { color: t.muted }]}> eaten </Text>
          <Text style={[styles.eqStrong, { color: t.text }]}>= </Text>
          <Text style={[styles.eqStrong, { color: equationColor }]}>
            {Math.abs(Math.round(actualDeficit)).toLocaleString()}
          </Text>
          <Text style={[styles.eqDim, { color: t.muted }]}>
            {' '}
            {isDeficit ? 'deficit' : 'surplus'}
          </Text>
        </View>
      ) : (
        <Text style={[styles.meta, { color: t.muted }]}>Log meals to see your balance</Text>
      )}
    </View>
  );
}

// ─── Macros panel ───────────────────────────────────────────────────────

function MacrosPanel({
  values,
  targets,
  empty,
}: {
  values: MacroValues;
  targets?: MacroTargets;
  empty?: boolean;
}) {
  const t = useTokens();

  if (empty) {
    return (
      <View style={styles.macrosEmpty}>
        <Text style={[styles.emptyText, { color: t.muted }]}>
          Log meals to see your macros and micros.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.macrosList}>
      <ProgressRow label="Protein" color={t.protein} consumed={values.proteinG}  target={targets?.proteinG}  unit="g" />
      <ProgressRow label="Carbs"   color={t.carbs}   consumed={values.carbsG}    target={targets?.carbsG}    unit="g" />
      <ProgressRow label="Fat"     color={t.fat}     consumed={values.fatG}      target={targets?.fatG}      unit="g" />
      <View style={[styles.divider, { backgroundColor: 'rgba(255,255,255,0.04)' }]} />
      <ProgressRow label="Sugar"   color={t.sugar}   consumed={values.sugarG}    target={targets?.sugarG}    unit="g" />
      <ProgressRow label="Fiber"   color={t.fiber}   consumed={values.fiberG}    target={targets?.fiberG}    unit="g" />
      <ProgressRow label="Sodium"  color={t.sodium}  consumed={values.sodiumMg}  target={targets?.sodiumMg}  unit="mg" />
    </View>
  );
}

function ProgressRow({
  label,
  color,
  consumed,
  target,
  unit,
}: {
  label: string;
  color: string;
  consumed: number;
  target: number | null | undefined;
  unit: string;
}) {
  const t = useTokens();
  const hasTarget = target != null && target > 0;
  const pct = hasTarget ? Math.min(1, consumed / (target as number)) : 0;
  const hit = hasTarget && consumed >= (target as number) * 0.95 && consumed <= (target as number) * 1.05;
  const over = hasTarget && consumed > (target as number) * 1.2;
  const fillColor = over ? t.danger : hit ? t.green : color;
  const valueColor = over ? t.danger : hit ? t.green : color;

  const valueText = hasTarget
    ? `${Math.round(consumed)}${unit} / ${Math.round(target as number)}${unit}`
    : `${Math.round(consumed)}${unit}`;

  return (
    <View style={rowStyles.row}>
      <View style={rowStyles.header}>
        <Text style={[rowStyles.label, { color: t.muted }]}>{label}</Text>
        <Text style={[rowStyles.value, { color: valueColor }]}>{valueText}</Text>
      </View>
      <View style={[rowStyles.track, { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
        <View
          style={[
            rowStyles.fill,
            { backgroundColor: fillColor, width: `${Math.max(pct * 100, hasTarget ? 2 : 0)}%` },
          ]}
        />
      </View>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: 20,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 3,
  },

  tabs: {
    flexDirection: 'row',
    marginBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  tabBtn: { paddingVertical: 8, marginRight: 20 },
  tabLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.1,
  },
  tabUnderline: {
    position: 'absolute',
    bottom: -1,
    left: 0,
    right: 0,
    height: 2,
    borderRadius: 1,
  },

  ringWrap: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignSelf: 'center',
    marginVertical: 4,
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

  macrosList: { gap: 12 },
  macrosEmpty: { paddingVertical: 30, alignItems: 'center' },
  emptyText: { fontSize: 14 },
  divider: { height: 1, marginVertical: 4 },
});

const rowStyles = StyleSheet.create({
  row: { gap: 6 },
  header: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { fontSize: 13 },
  value: { fontSize: 13, fontWeight: '600' },
  track: { height: 6, borderRadius: 100, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 100 },
});
