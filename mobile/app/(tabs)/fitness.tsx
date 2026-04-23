import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { EmptyState, FAB, StatCard, SubTabs } from '../../components/apex';
import { useProfile, useTodaySteps } from '../../lib/hooks/useHomeData';
import { useTokens } from '../../lib/theme';

type Tab = 'today' | 'progress' | 'history';

interface SubsystemCardProps { name: string; description: string }

function SubsystemCard({ name, description }: SubsystemCardProps) {
  const t = useTokens();
  return (
    <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
      <Text style={[styles.cardTitle, { color: t.text }]}>{name}</Text>
      <Text style={[styles.cardScore, { color: t.subtle }]}>—</Text>
      <Text style={[styles.cardHint, { color: t.muted }]}>{description}</Text>
    </View>
  );
}

const SUBSYSTEMS: { name: string; description: string }[] = [
  { name: 'Body', description: 'Weight trend, body fat, BMI' },
  { name: 'Strength', description: 'Weekly strength volume' },
  { name: 'Cardio', description: 'Weekly cardio minutes' },
  { name: 'Movement', description: 'Daily steps & activity' },
  { name: 'Sleep', description: 'Duration & efficiency (HealthKit)' },
  { name: 'Recovery', description: 'HRV & readiness' },
  { name: 'Plan', description: 'Training plan adherence' },
];

export default function FitnessScreen() {
  const t = useTokens();
  const [tab, setTab] = useState<Tab>('today');

  const profile = useProfile();
  const stepsState = useTodaySteps();
  const weight = profile.data?.current_weight_lbs ?? null;

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
      <ScrollView contentContainerStyle={styles.content}>
        {tab === 'today' ? (
          <>
            <View style={styles.scoreBlock}>
              <Text style={[styles.scoreBig, { color: t.text }]}>—</Text>
              <Text style={[styles.scoreLabel, { color: t.fitness }]}>Fitness score</Text>
            </View>
            <View style={styles.statRow}>
              <StatCard
                label="Weight"
                value={weight == null ? '—' : String(Math.round(weight))}
                style={styles.statHalf}
              />
              <StatCard
                label="Steps"
                value={stepsState.steps == null ? '—' : stepsState.steps.toLocaleString()}
                style={styles.statHalf}
              />
            </View>
            <View style={styles.subsystems}>
              {SUBSYSTEMS.map((s) => (
                <SubsystemCard key={s.name} name={s.name} description={s.description} />
              ))}
            </View>
          </>
        ) : null}
        {tab === 'progress' ? (
          <EmptyState icon="📈" title="Progress charts" description="Trend lines for each subsystem appear here once 14 days of data are collected." />
        ) : null}
        {tab === 'history' ? (
          <EmptyState icon="📅" title="Workout history" description="A card-per-day history list will appear here." />
        ) : null}
      </ScrollView>
      <FAB from="fitness" />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 96, gap: 16 },
  scoreBlock: { alignItems: 'center', paddingVertical: 12 },
  scoreBig: { fontSize: 48, fontWeight: '700' },
  scoreLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 },
  statRow: { flexDirection: 'row', gap: 10 },
  statHalf: { flexBasis: '48%', flexGrow: 1 },
  subsystems: { gap: 10 },
  card: { borderWidth: 1, borderRadius: 20, padding: 16, gap: 4 },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  cardScore: { fontSize: 26, fontWeight: '700' },
  cardHint: { fontSize: 12 },
});
