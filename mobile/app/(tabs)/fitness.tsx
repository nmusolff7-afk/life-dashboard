import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  ActivityCalendar,
  BurnTrendCard,
  EmptyState,
  FAB,
  LogActivityCard,
  NumberPromptModal,
  SavedWorkoutsStrip,
  StatCard,
  SubsystemsCard,
  SubTabs,
  TodayWorkoutsList,
  WeightTrendCard,
  WorkoutHistoryList,
} from '../../components/apex';
import { logWeight } from '../../lib/api/fitness';
import {
  useProfile,
  useSavedWorkouts,
  useTodaySteps,
  useTodayWorkouts,
  useWorkoutHistory,
} from '../../lib/hooks/useHomeData';
import { useTokens } from '../../lib/theme';
import { useResetScrollOnFocus } from '../../lib/useResetScrollOnFocus';
import { useStrengthSession } from '../../lib/useStrengthSession';
import { useUnits } from '../../lib/useUnits';

type Tab = 'today' | 'progress' | 'history';

export default function FitnessScreen() {
  const t = useTokens();
  const units = useUnits();
  const [tab, setTab] = useState<Tab>('today');
  const { ref: scrollRef, resetScroll } = useResetScrollOnFocus();

  const profile = useProfile();
  const workouts = useTodayWorkouts();
  const saved = useSavedWorkouts();
  const stepsState = useTodaySteps();
  const history = useWorkoutHistory(90);

  const strength = useStrengthSession();
  const [refreshing, setRefreshing] = useState(false);
  const [weightModal, setWeightModal] = useState(false);
  const [stepsModal, setStepsModal] = useState(false);

  /** Tap "Start strength session" — if one's already running, just maximize
   *  the existing one; otherwise start fresh. */
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
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  const refreshAllWorkouts = () => {
    workouts.refetch();
    history.refetch();
  };

  const weight = profile.data?.current_weight_lbs ?? null;
  const todayWorkouts = workouts.data?.workouts ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
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
      />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.muted} />
        }>
        {tab === 'today' ? (
          <>
            <View style={styles.scoreBlock}>
              <Text style={[styles.scoreBig, { color: t.subtle }]}>—</Text>
              <Text style={[styles.scoreLabel, { color: t.fitness }]}>Fitness score</Text>
              <Text style={[styles.scoreHint, { color: t.muted }]}>
                Activates once subsystems have enough data.
              </Text>
            </View>

            <Pressable
              onPress={launchStrength}
              style={({ pressed }) => [
                styles.startStrengthBtn,
                { backgroundColor: t.accent, opacity: pressed ? 0.85 : 1 },
              ]}>
              <Ionicons name="barbell" size={18} color="#fff" />
              <Text style={styles.startStrengthLabel}>Start strength session</Text>
            </Pressable>

            <LogActivityCard
              onLogged={refreshAllWorkouts}
              onTemplateSaved={saved.refetch}
            />

            <SavedWorkoutsStrip
              saved={saved.data ?? []}
              onLogged={refreshAllWorkouts}
              onRemoved={saved.refetch}
            />

            <TodayWorkoutsList workouts={todayWorkouts} onChanged={refreshAllWorkouts} />

            <SubsystemsCard
              profile={profile.data}
              weightLbs={weight}
              todayStepsState={{ steps: stepsState.steps }}
              recentWorkouts={history.data ?? []}
              onStartStrength={launchStrength}
            />

            <View style={styles.statRow}>
              <StatCard
                label={`Weight (${units.weightUnit})`}
                value={units.formatWeight(weight)}
                valueColor={weight == null ? undefined : t.text}
                onPress={() => setWeightModal(true)}
                style={styles.statHalf}
              />
              <StatCard
                label="Steps"
                value={stepsState.steps == null ? '—' : stepsState.steps.toLocaleString()}
                onPress={() => setStepsModal(true)}
                style={styles.statHalf}
              />
            </View>
          </>
        ) : null}

        {tab === 'progress' ? (
          <>
            <BurnTrendCard />
            <WeightTrendCard />
            <ActivityCalendar />
            <EmptyState
              icon="🏋️"
              title="Strength progression"
              description="Per-lift top-set charts need per-set data (workout_logs schema change)."
            />
          </>
        ) : null}

        {tab === 'history' ? (
          <WorkoutHistoryList
            workouts={history.data ?? []}
            onChanged={refreshAllWorkouts}
          />
        ) : null}
      </ScrollView>
      <FAB from="fitness" />

      <NumberPromptModal
        visible={weightModal}
        title="Log weight"
        unit={units.weightUnit}
        initial={weight != null && units.units === 'metric' ? weight * 0.453592 : weight}
        placeholder={units.units === 'metric' ? '82' : '180'}
        onClose={() => setWeightModal(false)}
        onSave={async (displayValue) => {
          // Persist in canonical lbs regardless of display unit.
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

      {/* StrengthTrackerModal itself is rendered at the tabs-layout level so
          it can be minimized without losing session state. See (tabs)/_layout.tsx. */}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 96, gap: 16 },

  scoreBlock: { alignItems: 'center', paddingVertical: 8, gap: 2 },
  scoreBig: { fontSize: 56, fontWeight: '700', lineHeight: 58, letterSpacing: -1.2 },
  scoreLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 4 },
  scoreHint: { fontSize: 12, textAlign: 'center', marginTop: 2 },

  startStrengthBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 16,
    paddingVertical: 14,
  },
  startStrengthLabel: { color: '#fff', fontSize: 15, fontWeight: '700' },

  statRow: { flexDirection: 'row', gap: 10 },
  statHalf: { flexBasis: '48%', flexGrow: 1 },
});
