import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  ActivityCalendar,
  BurnTrendCard,
  FitnessSubsystemCard,
  LogActivityCard,
  NumberPromptModal,
  OverallScoreHero,
  SubTabs,
  TabHeader,
  TodayScheduledWorkoutCard,
  TodayWorkoutsList,
  WeightTrendCard,
  WorkoutHistoryList,
} from '../../components/apex';
import { logWeight, logWorkout } from '../../lib/api/fitness';
import { classifyAsStrength } from '../../lib/strengthHelpers';
import {
  useProfile,
  useSavedWorkouts,
  useTodaySteps,
  useTodayWorkouts,
  useWorkoutHistory,
} from '../../lib/hooks/useHomeData';
import { useLiveCalorieBalance } from '../../lib/hooks/useLiveCalorieBalance';
import { useFitnessScore } from '../../lib/hooks/useScores';
import { useWorkoutPlan } from '../../lib/hooks/useWorkoutPlan';
import { useChatSession } from '../../lib/useChatSession';
import { useTokens } from '../../lib/theme';
import { useDailyReset } from '../../lib/useDailyReset';
import { useResetScrollOnFocus } from '../../lib/useResetScrollOnFocus';
import { useStrengthSession } from '../../lib/useStrengthSession';
import { useUnits } from '../../lib/useUnits';

import type { SubsystemScore } from '../../../shared/src/types/score';
import type { DayName, WorkoutPlanResponse } from '../../../shared/src/types/plan';
import type { TodayScheduledWorkout } from '../../components/apex/TodayScheduledWorkoutCard';

type Tab = 'today' | 'progress' | 'history';
/** Filter chips on the Fitness History sub-tab. Weight trend lives on
 *  the Progress sub-tab only — founder flagged the History duplication
 *  and wants filtering by AI-classified session_type instead. */
type HistoryFilter = 'all' | 'strength' | 'cardio' | 'mixed';

export default function FitnessScreen() {
  const t = useTokens();
  const units = useUnits();
  const [tab, setTab] = useState<Tab>('today');
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');
  const { ref: scrollRef, resetScroll } = useResetScrollOnFocus();

  const profile = useProfile();
  const workouts = useTodayWorkouts();
  const saved = useSavedWorkouts();
  const stepsState = useTodaySteps();
  const history = useWorkoutHistory(90);
  const balance = useLiveCalorieBalance();
  const fitnessScore = useFitnessScore();

  const strength = useStrengthSession();
  const workoutPlan = useWorkoutPlan();
  const [refreshing, setRefreshing] = useState(false);
  const [weightModal, setWeightModal] = useState(false);
  const [stepsModal, setStepsModal] = useState(false);

  const launchStrength = () => {
    if (strength.active) strength.maximize();
    else void strength.start();
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        profile.refetch(),
        workouts.refetch(),
        saved.refetch(),
        stepsState.refetch(),
        history.refetch(),
        fitnessScore.refetch(),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  const refreshAllWorkouts = () => {
    workouts.refetch();
    history.refetch();
  };

  // Silently refetch when the local day rolls over.
  useDailyReset(() => {
    void onRefresh();
  });

  // Refetch when a FAB quick-log modal saves from over any tab.
  const chat = useChatSession();
  const { dataVersion } = chat;
  useEffect(() => {
    if (dataVersion > 0) void onRefresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataVersion]);

  // Reset sub-tab to Today whenever this tab regains focus per founder —
  // switching across the 5 main tabs should always land on the Today
  // pane, never a stale Progress/History state from a prior visit.
  useFocusEffect(
    useCallback(() => {
      setTab('today');
    }, []),
  );

  const weight = profile.data?.current_weight_lbs ?? null;
  const todayWorkouts = workouts.data?.workouts ?? [];
  const lastWorkout = todayWorkouts[todayWorkouts.length - 1];

  // Per-subsystem hints — parent derives, child renders.
  const hints = useMemo(() => buildSubsystemHints({
    stepsToday: stepsState.steps ?? 0,
    totalBurn: balance.totalBurn,
    weightLbs: weight,
    lastWorkoutDesc: lastWorkout?.description ?? null,
    weightUnit: units.weightUnit,
    formatWeight: units.formatWeight,
  }), [stepsState.steps, balance.totalBurn, weight, lastWorkout, units]);

  const subsystems = fitnessScore.data?.subsystems ?? [];
  const orderedSubs = orderSubsystems(subsystems);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <TabHeader
        title="Fitness"
        right={
          <SubTabs<Tab>
            tabs={[
              { value: 'today', label: 'Today' },
              { value: 'progress', label: 'Progress' },
              { value: 'history', label: 'History' },
            ]}
            value={tab}
            onChange={(next) => {
              setTab(next);
              resetScroll();
            }}
            compact
          />
        }
      />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.muted} />
        }>
        {tab === 'today' ? (
          <>
            {/* Fitness Score hero — reuses OverallScoreHero shape with
                category data. Passing contributing=[fitness] keeps the
                label simple. */}
            <OverallScoreHero
              data={
                fitnessScore.data
                  ? {
                      score: fitnessScore.data.score,
                      band: fitnessScore.data.band,
                      reason: fitnessScore.data.reason,
                      calibrating: fitnessScore.data.calibrating,
                      contributing: ['fitness'],
                      effective_weights: { fitness: 100, nutrition: 0, finance: 0, time: 0 },
                      data_completeness_overall: fitnessScore.data.data_completeness_overall,
                      sparkline_7d: fitnessScore.data.sparkline_7d ?? [],
                      cta: fitnessScore.data.cta,
                    }
                  : null
              }
              loading={fitnessScore.loading}
            />

            {/* Today's summary — compact row of the key metrics. */}
            <View style={styles.summaryRow}>
              <SummaryCell label="Burn" value={balance.totalBurn != null ? `${balance.totalBurn}` : '—'} unit="kcal" color={t.fitness} />
              <View style={[styles.summaryDivider, { backgroundColor: t.border }]} />
              <SummaryCell
                label="Steps"
                value={stepsState.steps != null ? stepsState.steps.toLocaleString() : '—'}
                color={t.text}
              />
              <View style={[styles.summaryDivider, { backgroundColor: t.border }]} />
              <SummaryCell
                label="Weight"
                value={weight != null ? units.formatWeight(weight) : '—'}
                color={t.text}
              />
            </View>

            {/* Log Activity card first — primary user action on the
                Fitness Today tab. Today's scheduled workout follows
                below so the user can see what's planned after the
                explicit log-action. */}
            <LogActivityCard
              onLogged={refreshAllWorkouts}
              onTemplateSaved={saved.refetch}
              onStrengthPress={launchStrength}
              onCardioPress={() => chat.openQuickLog('workout-cardio')}
              onSavedPress={() => chat.openQuickLog('workout-saved')}
              onWeightPress={() => chat.openQuickLog('weight')}
            />

            {/* Today's Scheduled Workout card — separates strength +
                cardio into their own action rows. */}
            <TodayScheduledWorkoutCard
              plan={deriveTodayFromPlan(workoutPlan.plan)}
              loading={workoutPlan.loading}
              onStartPlannedStrength={() => startTodaysPlannedSession(workoutPlan.plan, strength)}
              onStartAdhoc={launchStrength}
              onLogCardio={async () => {
                const cardioLabel = deriveTodayCardio(workoutPlan.plan);
                if (!cardioLabel) return;
                try {
                  await logWorkout(cardioLabel, estimateCardioBurn(cardioLabel), 'cardio');
                  await refreshAllWorkouts();
                } catch {
                  // best-effort; errors surface via Alert in the modal path
                }
              }}
              onLogCardioManual={() => chat.openQuickLog('workout-cardio')}
            />

            <TodayWorkoutsList workouts={todayWorkouts} onChanged={refreshAllWorkouts} />

            {/* 7 subsystem cards stacked — each drills to its detail screen. */}
            <View style={styles.subsystemStack}>
              {orderedSubs.map((sub) => (
                <FitnessSubsystemCard
                  key={sub.key}
                  subsystem={sub}
                  href={`/fitness/subsystem/${sub.key}` as const as never}
                  hint={hints[sub.key] ?? null}
                  icon={ICONS[sub.key] ?? 'ellipse-outline'}
                />
              ))}
            </View>
          </>
        ) : null}

        {tab === 'progress' ? (
          <>
            <BurnTrendCard />
            <WeightTrendCard />
            <ActivityCalendar />
          </>
        ) : null}

        {tab === 'history' ? (
          <>
            <View style={styles.filterRow}>
              {(['all', 'strength', 'cardio', 'mixed'] as const).map((f) => (
                <FilterChip
                  key={f}
                  label={f.charAt(0).toUpperCase() + f.slice(1)}
                  active={historyFilter === f}
                  onPress={() => setHistoryFilter(f)}
                />
              ))}
            </View>

            <WorkoutHistoryList
              workouts={(history.data ?? []).filter((w) => {
                if (historyFilter === 'all') return true;
                // Prefer the AI session_type stamped at log time; fall
                // back to keyword classify for legacy rows.
                const st = w.session_type ?? (classifyAsStrength(w.description ?? '') ? 'strength' : 'cardio');
                return st === historyFilter;
              })}
              onChanged={refreshAllWorkouts}
            />
          </>
        ) : null}
      </ScrollView>

      <NumberPromptModal
        visible={weightModal}
        title="Log weight"
        unit={units.weightUnit}
        initial={weight != null && units.units === 'metric' ? weight * 0.453592 : weight}
        placeholder={units.units === 'metric' ? '82' : '180'}
        onClose={() => setWeightModal(false)}
        onSave={async (displayValue) => {
          await logWeight(units.toCanonicalWeightLbs(displayValue));
          await profile.refetch();
        }}
      />
      <NumberPromptModal
        visible={stepsModal}
        title="Log steps"
        initial={stepsState.steps}
        placeholder="8000"
        onClose={() => setStepsModal(false)}
        onSave={async (n) => {
          await stepsState.save(Math.round(n));
        }}
      />
    </View>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────

const DOW_NAMES: DayName[] = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];

/** Convert the active workout plan response into the small shape the
 *  TodayScheduledWorkoutCard consumes. Null when no plan is active. */
function deriveTodayFromPlan(plan: WorkoutPlanResponse | null): TodayScheduledWorkout | null {
  if (!plan) return null;
  const todayName = DOW_NAMES[new Date().getDay()];
  const dayBlock = (plan.plan?.weeklyPlan ?? {})[todayName];
  if (!dayBlock) return { isRestDay: true };
  const exercises = (dayBlock.exercises ?? []).map((e) => ({
    name: e.name,
    sets: Math.max(0, Number(e.sets ?? 0)),
  }));
  const cardioLabel = (dayBlock.cardio?.type || '').trim();
  if (exercises.length === 0 && !cardioLabel) {
    return { isRestDay: true };
  }
  return {
    dayName: dayBlock.label || todayName,
    exercises,
    cardio: cardioLabel ? { type: cardioLabel } : null,
    isRestDay: false,
  };
}

function deriveTodayCardio(plan: WorkoutPlanResponse | null): string | null {
  if (!plan) return null;
  const todayName = DOW_NAMES[new Date().getDay()];
  const dayBlock = (plan.plan?.weeklyPlan ?? {})[todayName];
  const label = (dayBlock?.cardio?.type || '').trim();
  return label || null;
}

/** Rough METs-based kcal estimate for the "Mark complete" one-tap cardio
 *  log. Assumes 30 minutes at a moderate pace for a 165 lb user. Good
 *  enough for a quick-log; the Manual Log path (Quick Log cardio modal)
 *  is for precise entry. */
function estimateCardioBurn(label: string): number {
  const l = label.toLowerCase();
  const mets =
    l.includes('easy run') || l.includes('walk') || l.includes('easy ride') ? 5 :
    l.includes('tempo') || l.includes('brisk') ? 8 :
    l.includes('interval') || l.includes('hiit') || l.includes('hill') ? 10 :
    l.includes('long run') || l.includes('long ride') ? 9 :
    l.includes('recovery') ? 4 :
    l.includes('swim') ? 8 :
    l.includes('jump rope') || l.includes('stair') ? 11 :
    7;
  const minutes = 30;
  const weightLbs = 165;
  return Math.round((mets * 3.5 * weightLbs * 0.453592) / 200 * minutes);
}

/** Seed the strength session with today's scheduled exercises + start
 *  it. Called from TodayScheduledWorkoutCard's "Start Workout" button
 *  when a plan is active AND today isn't a rest day. */
function startTodaysPlannedSession(
  plan: WorkoutPlanResponse | null,
  strength: { active: boolean; start: () => Promise<void>; maximize: () => void; setExercises: (e: { name: string; sets: { completed: boolean; weight: string; reps: string }[] }[]) => void },
) {
  if (!plan) {
    if (strength.active) strength.maximize();
    else void strength.start();
    return;
  }
  const todayName = DOW_NAMES[new Date().getDay()];
  const dayBlock = (plan.plan?.weeklyPlan ?? {})[todayName];
  if (!dayBlock || (!dayBlock.exercises?.length)) {
    if (strength.active) strength.maximize();
    else void strength.start();
    return;
  }
  if (strength.active) {
    strength.maximize();
    return;
  }
  const exercises = dayBlock.exercises.map((ex) => ({
    name: ex.name,
    sets: Array.from({ length: Math.max(1, Number(ex.sets ?? 3)) }, () => ({
      completed: false, weight: '', reps: '',
    })),
  }));
  strength.setExercises(exercises);
  void strength.start();
}

const SUBSYSTEM_ORDER: Array<SubsystemScore['key']> = [
  'plan',
  'strength',
  'cardio',
  'body',
  'movement',
  'sleep',
  'recovery',
];

const ICONS: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  plan: 'calendar-outline',
  strength: 'barbell-outline',
  cardio: 'pulse-outline',
  body: 'body-outline',
  movement: 'walk-outline',
  sleep: 'moon-outline',
  recovery: 'heart-circle-outline',
};

function orderSubsystems(subs: SubsystemScore[]): SubsystemScore[] {
  const byKey = new Map(subs.map((s) => [s.key, s]));
  const ordered: SubsystemScore[] = [];
  for (const key of SUBSYSTEM_ORDER) {
    const s = byKey.get(key);
    if (s) ordered.push(s);
  }
  // Append any unknown-key subsystems at the end (future-proof)
  for (const s of subs) {
    if (!SUBSYSTEM_ORDER.includes(s.key as typeof SUBSYSTEM_ORDER[number])) {
      ordered.push(s);
    }
  }
  return ordered;
}

function buildSubsystemHints(ctx: {
  stepsToday: number;
  totalBurn: number | null;
  weightLbs: number | null;
  lastWorkoutDesc: string | null;
  weightUnit: string;
  formatWeight: (n: number | null) => string;
}): Record<string, string> {
  return {
    plan: ctx.lastWorkoutDesc
      ? `Last: ${ctx.lastWorkoutDesc.slice(0, 40)}`
      : 'No active plan',
    strength: ctx.lastWorkoutDesc?.match(/x\d+|set/i)
      ? `Logged: ${ctx.lastWorkoutDesc.slice(0, 40)}`
      : 'No strength logged today',
    cardio: ctx.lastWorkoutDesc?.match(/\b(run|jog|bike|swim|walk|row|cardio)\b/i)
      ? `Today: ${ctx.lastWorkoutDesc.slice(0, 40)}`
      : 'No cardio logged today',
    body: ctx.weightLbs != null
      ? `${ctx.formatWeight(ctx.weightLbs)} today`
      : 'Log weight to activate',
    movement: ctx.stepsToday > 0
      ? `${ctx.stepsToday.toLocaleString()} steps today`
      : 'No steps logged today',
    sleep: 'Connect Apple Health to activate',
    recovery: 'Connect Apple Health to activate',
  };
}

function SummaryCell({ label, value, unit, color }: { label: string; value: string; unit?: string; color: string }) {
  const t = useTokens();
  return (
    <View style={styles.summaryCell}>
      <Text style={[styles.summaryValue, { color }]}>
        {value}
        {unit ? <Text style={[styles.summaryUnit, { color: t.muted }]}> {unit}</Text> : null}
      </Text>
      <Text style={[styles.summaryLabel, { color: t.muted }]}>{label}</Text>
    </View>
  );
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const t = useTokens();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: active ? t.accent : t.surface,
          borderColor: active ? t.accent : t.border,
          opacity: pressed ? 0.88 : 1,
        },
      ]}>
      <Text style={[styles.chipLabel, { color: active ? '#fff' : t.text, fontWeight: active ? '700' : '500' }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 72, gap: 14 },

  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    gap: 0,
  },
  summaryDivider: { width: 1, height: 32, alignSelf: 'center' },
  summaryCell: { flex: 1, alignItems: 'center', gap: 2 },
  summaryValue: { fontSize: 16, fontWeight: '700' },
  summaryUnit: { fontSize: 10, fontWeight: '500' },
  summaryLabel: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 },

  startStrengthBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 16,
    paddingVertical: 14,
  },
  startStrengthLabel: { color: '#fff', fontSize: 15, fontWeight: '700' },

  subsystemStack: { gap: 8 },

  filterRow: { flexDirection: 'row', gap: 8 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 100,
    borderWidth: 1,
  },
  chipLabel: { fontSize: 13 },
});
