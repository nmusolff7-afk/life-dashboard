import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  EmptyState,
  FAB,
  LogActivityCard,
  NumberPromptModal,
  SavedWorkoutsStrip,
  StatCard,
  SubTabs,
  TodayWorkoutsList,
} from '../../components/apex';
import { logWeight } from '../../lib/api/fitness';
import {
  useProfile,
  useSavedWorkouts,
  useTodaySteps,
  useTodayWorkouts,
} from '../../lib/hooks/useHomeData';
import { useTokens } from '../../lib/theme';

type Tab = 'today' | 'progress' | 'history';

interface SubsystemCardProps { name: string; description: string }

function SubsystemCard({ name, description }: SubsystemCardProps) {
  const t = useTokens();
  return (
    <View style={[styles.subCard, { backgroundColor: t.surface, borderColor: t.border }]}>
      <Text style={[styles.subTitle, { color: t.text }]}>{name}</Text>
      <Text style={[styles.subScore, { color: t.subtle }]}>—</Text>
      <Text style={[styles.subHint, { color: t.muted }]}>{description}</Text>
    </View>
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

  const [refreshing, setRefreshing] = useState(false);
  const [weightModal, setWeightModal] = useState(false);
  const [stepsModal, setStepsModal] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([profile.refetch(), workouts.refetch(), saved.refetch(), stepsState.refetch()]);
    } finally {
      setRefreshing(false);
    }
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

            <SavedWorkoutsStrip
              saved={saved.data ?? []}
              onLogged={workouts.refetch}
              onRemoved={saved.refetch}
            />

            <LogActivityCard
              onLogged={() => {
                workouts.refetch();
              }}
              onTemplateSaved={saved.refetch}
            />

            <TodayWorkoutsList workouts={todayWorkouts} onChanged={workouts.refetch} />

            <Text style={[styles.subsystemsLabel, { color: t.muted }]}>Subsystems</Text>
            <View style={styles.subsystems}>
              {SUBSYSTEMS.map((s) => (
                <SubsystemCard key={s.name} name={s.name} description={s.description} />
              ))}
            </View>
          </>
        ) : null}

        {tab === 'progress' ? (
          <EmptyState
            icon="📈"
            title="Progress charts"
            description="Daily burn, bodyweight trend, strength progression, and the activity calendar ship in Phase 3 (needs chart library + new Flask endpoints)."
          />
        ) : null}

        {tab === 'history' ? (
          <EmptyState
            icon="📅"
            title="Workout history"
            description="Filtered history with strength/cardio/both chips ships in Phase 2 (uses existing /api/history)."
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
