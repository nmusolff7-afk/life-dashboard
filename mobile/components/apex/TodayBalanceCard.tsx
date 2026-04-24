import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import {
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import type { Meal, Workout } from '../../../shared/src/types/home';
import { useTokens } from '../../lib/theme';
import { ProgressRow } from './ProgressRow';

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
  /** Calories logged today. */
  totalIntake: number;
  /** totalBurn + deficit_surplus, live from useLiveCalorieBalance. */
  goalIntake?: number | null;
  /** Live RMR + NEAT + EAT + TEF. */
  totalBurn?: number | null;
  macroValues: MacroValues;
  macroTargets?: MacroTargets;
  empty?: boolean;
  /** Today's meals + workouts to render on the Timeline tab. */
  meals?: Meal[];
  workouts?: Workout[];
  /** Called when the Goals tab's CTA is tapped. */
  onGoalsPress?: () => void;
}

const TABS = [
  { key: 'balance', label: 'Balance' },
  { key: 'macros',  label: 'Macros'  },
  { key: 'timeline', label: 'Timeline' },
  { key: 'goals',   label: 'Goals'   },
] as const;
type TabKey = typeof TABS[number]['key'];

const RING_SIZE = 180;
const R = 50;
const CIRC = 2 * Math.PI * R;

/** Home's primary Today card. Four tabs — Balance / Macros / Timeline / Goals —
 *  rendered inside a horizontal paging ScrollView so users can swipe OR tap
 *  the tab row to switch. Tab underline animates by index. */
export function TodayBalanceCard({
  totalIntake,
  goalIntake,
  totalBurn,
  macroValues,
  macroTargets,
  empty,
  meals = [],
  workouts = [],
  onGoalsPress,
}: Props) {
  const t = useTokens();
  const [tab, setTab] = useState<TabKey>('balance');
  const [pageWidth, setPageWidth] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w !== pageWidth) setPageWidth(w);
  };

  const onMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (pageWidth === 0) return;
    const idx = Math.round(e.nativeEvent.contentOffset.x / pageWidth);
    const next = TABS[Math.max(0, Math.min(TABS.length - 1, idx))].key;
    if (next !== tab) setTab(next);
  };

  const selectTab = (k: TabKey) => {
    setTab(k);
    const idx = TABS.findIndex((x) => x.key === k);
    scrollRef.current?.scrollTo({ x: idx * pageWidth, animated: true });
  };

  return (
    <View style={[styles.card, { backgroundColor: t.surface, shadowColor: '#000' }]}>
      <View style={styles.tabs}>
        {TABS.map((x) => (
          <TabBtn
            key={x.key}
            label={x.label}
            active={tab === x.key}
            onPress={() => selectTab(x.key)}
          />
        ))}
      </View>

      <View onLayout={onLayout}>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onMomentumScrollEnd}>
          <View style={[styles.page, { width: pageWidth }]}>
            <BalancePanel
              totalIntake={totalIntake}
              goalIntake={goalIntake}
              totalBurn={totalBurn}
            />
          </View>
          <View style={[styles.page, { width: pageWidth }]}>
            <MacrosPanel values={macroValues} targets={macroTargets} empty={empty} />
          </View>
          <View style={[styles.page, { width: pageWidth }]}>
            <TimelinePanel meals={meals} workouts={workouts} />
          </View>
          <View style={[styles.page, { width: pageWidth }]}>
            <GoalsPanel onPress={onGoalsPress} />
          </View>
        </ScrollView>
      </View>
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
          { color: active ? t.accent : t.muted, fontWeight: active ? '700' : '500' },
        ]}>
        {label}
      </Text>
      {active ? <View style={[styles.tabUnderline, { backgroundColor: t.accent }]} /> : null}
    </Pressable>
  );
}

// ─── Balance panel ──────────────────────────────────────────────────────

function BalancePanel({
  totalIntake,
  goalIntake,
  totalBurn,
}: Pick<Props, 'totalIntake' | 'goalIntake' | 'totalBurn'>) {
  const t = useTokens();
  const intake = Math.max(0, totalIntake);
  const goal = goalIntake ?? 0;
  const burn = totalBurn ?? 0;
  const hasData = intake > 0 || burn > 0;

  const pct = goal > 0 ? Math.min(1, intake / goal) : 0;
  const dash = CIRC * pct;
  const distanceToGoal = goal - intake; // +ve = cals left, -ve = over

  const ringColor = !hasData
    ? t.surface2
    : distanceToGoal > 0
      ? t.green
      : distanceToGoal > -200
        ? t.amber
        : t.danger;

  let centerValue = '—';
  let centerLabel = 'balance';
  let centerColor = t.muted;
  if (hasData && goal > 0) {
    if (distanceToGoal >= 0) {
      centerValue = Math.round(distanceToGoal).toLocaleString();
      centerLabel = 'cals left';
      centerColor = t.green;
    } else {
      centerValue = Math.round(Math.abs(distanceToGoal)).toLocaleString();
      centerLabel = 'over goal';
      centerColor = t.danger;
    }
  }

  // "Actual current deficit/surplus" per founder spec: totalBurn − totalIntake
  // Positive → actual deficit; negative → actual surplus.
  const actualNet = burn - intake;
  const isDeficit = actualNet >= 0;
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
          <Text style={[styles.eqStrong, { color: t.text }]}>{Math.round(burn).toLocaleString()}</Text>
          <Text style={[styles.eqDim, { color: t.muted }]}> burn </Text>
          <Text style={[styles.eqStrong, { color: t.text }]}>−</Text>
          <Text style={[styles.eqStrong, { color: t.text }]}>
            {' '}
            {Math.round(intake).toLocaleString()}
          </Text>
          <Text style={[styles.eqDim, { color: t.muted }]}> intake </Text>
          <Text style={[styles.eqStrong, { color: t.text }]}>= </Text>
          <Text style={[styles.eqStrong, { color: equationColor }]}>
            {Math.abs(Math.round(actualNet)).toLocaleString()}
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
      <View style={styles.panelEmpty}>
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

// ─── Timeline panel ─────────────────────────────────────────────────────

interface TimelineItem {
  kind: 'meal' | 'workout';
  time: string;
  description: string;
  kcal: number;
}

function timeOf(iso: string): number {
  const t = new Date(iso).getTime();
  return isNaN(t) ? 0 : t;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const h = d.getHours();
  const m = d.getMinutes();
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function TimelinePanel({ meals, workouts }: { meals: Meal[]; workouts: Workout[] }) {
  const t = useTokens();
  const items: TimelineItem[] = [
    ...meals.map<TimelineItem>((m) => ({
      kind: 'meal',
      time: m.logged_at,
      description: m.description,
      kcal: m.calories ?? 0,
    })),
    ...workouts.map<TimelineItem>((w) => ({
      kind: 'workout',
      time: w.logged_at,
      description: w.description,
      kcal: w.calories_burned ?? 0,
    })),
  ].sort((a, b) => timeOf(a.time) - timeOf(b.time));

  if (items.length === 0) {
    return (
      <View style={styles.panelEmpty}>
        <Text style={[styles.emptyText, { color: t.muted }]}>
          No meals or workouts logged yet today.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.timelineList}>
      {items.map((it, i) => (
        <View key={i} style={[styles.timelineRow, { borderBottomColor: t.border }]}>
          <Ionicons
            name={it.kind === 'meal' ? 'restaurant-outline' : 'barbell-outline'}
            size={18}
            color={it.kind === 'meal' ? t.cal : t.fitness}
          />
          <View style={{ flex: 1 }}>
            <Text style={[styles.timelineDesc, { color: t.text }]} numberOfLines={2}>
              {it.description}
            </Text>
            <Text style={[styles.timelineTime, { color: t.muted }]}>{formatTime(it.time)}</Text>
          </View>
          <Text style={[styles.timelineKcal, { color: it.kind === 'meal' ? t.cal : t.fitness }]}>
            {it.kind === 'workout' ? '+' : ''}{it.kcal} <Text style={styles.timelineKcalUnit}>kcal</Text>
          </Text>
        </View>
      ))}
    </View>
  );
}

// ─── Goals panel ────────────────────────────────────────────────────────

function GoalsPanel({ onPress }: { onPress?: () => void }) {
  const t = useTokens();
  return (
    <View style={styles.goalsWrap}>
      <Text style={styles.goalsEmoji}>🎯</Text>
      <Text style={[styles.goalsTitle, { color: t.text }]}>No active goals yet</Text>
      <Text style={[styles.goalsBody, { color: t.muted }]}>
        Pick up to 3 goals to shape your targets and score.
      </Text>
      {onPress ? (
        <Pressable
          onPress={onPress}
          style={({ pressed }) => [
            styles.goalsCta,
            { backgroundColor: t.accent, opacity: pressed ? 0.85 : 1 },
          ]}>
          <Text style={styles.goalsCtaLabel}>Browse goal library</Text>
        </Pressable>
      ) : null}
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
    fontSize: 13,
    letterSpacing: 0.1,
  },
  tabUnderline: {
    position: 'absolute',
    bottom: -1,
    left: 0,
    right: 0,
    height: 2,
    borderRadius: 1,
  },

  page: { paddingVertical: 2 },

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
  panelEmpty: { paddingVertical: 40, alignItems: 'center' },
  emptyText: { fontSize: 14, textAlign: 'center' },
  divider: { height: 1, marginVertical: 4 },

  timelineList: { gap: 0 },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  timelineDesc: { fontSize: 14, fontWeight: '500' },
  timelineTime: { fontSize: 11, marginTop: 2 },
  timelineKcal: { fontSize: 14, fontWeight: '700' },
  timelineKcalUnit: { fontSize: 10, fontWeight: '500' },

  goalsWrap: { alignItems: 'center', paddingVertical: 24, gap: 6 },
  goalsEmoji: { fontSize: 40 },
  goalsTitle: { fontSize: 16, fontWeight: '700' },
  goalsBody: { fontSize: 13, textAlign: 'center', maxWidth: 280 },
  goalsCta: {
    marginTop: 10,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  goalsCtaLabel: { color: '#fff', fontWeight: '700', fontSize: 13 },
});

