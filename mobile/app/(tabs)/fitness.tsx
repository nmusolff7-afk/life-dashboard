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
  StrengthTrackerModal,
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

type Tab = 'today' | 'progress' | 'history';

interface SubsystemCardProps {
  name: string;
  description: string;
  onPress?: () => void;
}

function SubsystemCard({ name, description, onPress }: SubsystemCardProps) {
  const t = useTokens();
  const Container: React.ElementType = onPress ? Pressable : View;
  return (
    <Container
      onPress={onPress}
      style={[styles.subCard, { backgroundColor: t.surface, borderColor: t.border }]}>
      <Text style={[styles.subTitle, { color: t.text }]}>{name}</Text>
      <Text style={[styles.subScore, { color: t.subtle }]}>—</Text>
      <Text style={[styles.subHint, { color: t.muted }]}>{description}</Text>
    </Container>
  );
}

const SUBSYSTEMS: { name: string; description: string }[] = [
  { name: 'Body', description: 'Weight trend, body composition' },
  { name: 'Strength', description: 'Strength consistency & progression' },
  { name: 'Cardio', description: 'Cardio volume & heart rate zones' },
  { name: 'Movement', description: 'Daily steps, NEAT, active time' },
  { name: 'Sleep', description: 'Duration & efficiency (HealthKit)' },
  { name: 'Recovery', description: 'HRV & readiness (HealthKit)' },
  { name: 'Plan', description: 'Workout plan adherence' },
];

export default function FitnessScreen() {
  const t = useTokens();
  const [tab, setTab] = useState<Tab>('today');

  const profile = useProfile();
  const workouts = useTodayWorkouts();
  const saved = useSavedWorkouts();
  const stepsState = useTodaySteps();
  const history = useWorkoutHistory(90);

  const [refreshing, setRefreshing] = useState(false);
  const [weightModal, setWeightModal] = useState(false);
  const [stepsModal, setStepsModal] = useState(false);
  const [trackerOpen, setTrackerOpen] = useState(false);

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

  // Any mutation that touches a workout (log / edit / delete) needs to
  // refresh both today's list and the 90-day history list.
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
        onChange={setTab}
      />
      <ScrollView
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

            <View style={styles.statRow}>
              <StatCard
                label="Weight"
                value={weight == null ? '—' : String(Math.round(weight))}
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

            <Pressable
              onPress={() => setTrackerOpen(true)}
              style={({ pressed }) => [
                styles.startStrengthBtn,
                { backgroundColor: t.accent, opacity: pressed ? 0.85 : 1 },
              ]}>
              <Ionicons name="barbell" size={18} color="#fff" />
              <Text style={styles.startStrengthLabel}>Start strength session</Text>
            </Pressable>

            <SavedWorkoutsStrip
              saved={saved.data ?? []}
              onLogged={refreshAllWorkouts}
              onRemoved={saved.refetch}
            />

            <LogActivityCard
              onLogged={refreshAllWorkouts}
              onTemplateSaved={saved.refetch}
            />

            <TodayWorkoutsList workouts={todayWorkouts} onChanged={refreshAllWorkouts} />

            <Text style={[styles.subsystemsLabel, { color: t.muted }]}>Subsystems</Text>
            <View style={styles.subsystems}>
              {SUBSYSTEMS.map((s) => (
                <SubsystemCard
                  key={s.name}
                  name={s.name}
                  description={s.description}
                  onPress={s.name === 'Plan' ? () => setTrackerOpen(true) : undefined}
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
            <EmptyState
              icon="🏋️"
              title="Strength progression"
              description="Per-lift top-set charts ship in Phase 4 — needs per-set data (workout_logs schema change)."
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
        unit="lbs"
        initial={weight}
        placeholder="180"
        onClose={() => setWeightModal(false)}
        onSave={async (n) => {
          await logWeight(n);
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

      <StrengthTrackerModal
        visible={trackerOpen}
        onClose={() => setTrackerOpen(false)}
        onLogged={refreshAllWorkouts}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 96, gap: 16 },

  scoreBlock: { alignItems: 'center', paddingVertical: 8, gap: 2 },
  scoreBig: { fontSize: 56, fontWeight: '700', lineHeight: 58, letterSpacing: -1.2 },
  scoreLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 4 },
  scoreHint: { fontSize: 12, textAlign: 'center', marginTop: 2 },

  statRow: { flexDirection: 'row', gap: 10 },
  statHalf: { flexBasis: '48%', flexGrow: 1 },

  startStrengthBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 16,
    paddingVertical: 14,
  },
  startStrengthLabel: { color: '#fff', fontSize: 15, fontWeight: '700' },

  subsystemsLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1.1,
    marginTop: 4,
    paddingHorizontal: 2,
  },
  subsystems: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  subCard: { flexBasis: '48%', flexGrow: 1, borderWidth: 1, borderRadius: 20, padding: 16, gap: 4 },
  subTitle: { fontSize: 14, fontWeight: '700' },
  subScore: { fontSize: 26, fontWeight: '700' },
  subHint: { fontSize: 11 },
});
