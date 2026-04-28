import { Stack } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { NumberPromptModal } from '../../../components/apex';
import { useState } from 'react';
import { OCC_BASE, computeNeat, type Occupation } from '../../../../shared/src/logic/neat';
import { healthHubLabel, useAutoSyncHealthOnFocus, useHealthData, useHealthToday } from '../../../lib/hooks/useHealthData';
import { useProfile, useTodaySteps, useTodayWorkouts } from '../../../lib/hooks/useHomeData';
import { useTokens } from '../../../lib/theme';

/** Movement subsystem — steps today + NEAT breakdown (Settings-only rule
 *  allows showing NEAT here since Movement IS the subsystem that owns it
 *  conceptually, but we present as "daily activity calories" not as
 *  individual RMR/EAT/TEF components). */
export default function MovementDetail() {
  const t = useTokens();
  const stepsState = useTodaySteps();
  const profile = useProfile();
  const workouts = useTodayWorkouts();
  const hc = useHealthData();
  const { today: hcToday, refetch: refetchHc } = useHealthToday();
  // Auto-sync HC on mount when permitted (90s app-wide throttle).
  useAutoSyncHealthOnFocus(refetchHc);
  const [stepsModal, setStepsModal] = useState(false);
  // Prefer HC's active_kcal when available; otherwise show empty-state
  // copy that points the user at Health Connect on Android (or Apple
  // Health on iOS, when that lands).
  const activeKcal = hcToday?.active_kcal ?? null;
  const hcSteps = hcToday?.steps ?? null;
  // Override the manually-logged step count with HC's read when HC is
  // permitted AND has data — manual entry is the fallback for users
  // without a wearable.
  const displaySteps = (hc.permitted && hcSteps != null) ? hcSteps : stepsState.steps;

  const occupation: Occupation = ((): Occupation => {
    const ws = profile.data?.work_style;
    return ws === 'standing' || ws === 'physical' ? ws : 'sedentary';
  })();
  const neat = computeNeat({
    occupation,
    totalSteps: stepsState.steps ?? 0,
    workoutDescriptions: (workouts.data?.workouts ?? []).map((w) => w.description ?? ''),
  });

  const activeMinTarget = 30; // CDC minimum; will be user-adjustable in §4.10

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen
        options={{
          title: 'Movement',
          headerStyle: { backgroundColor: t.bg },
          headerTintColor: t.text,
          headerShadowVisible: false,
        }}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.heroCard, { backgroundColor: t.surface, borderColor: t.border }]}>
          <Text style={[styles.heroLabel, { color: t.muted }]}>STEPS TODAY</Text>
          <Text style={[styles.heroValue, { color: t.text }]}>
            {displaySteps != null ? displaySteps.toLocaleString() : '—'}
          </Text>
          {hc.permitted && hcSteps != null ? (
            <Text style={[styles.hcHint, { color: t.subtle }]}>
              from {healthHubLabel()}
            </Text>
          ) : null}
          <Pressable
            onPress={() => setStepsModal(true)}
            style={({ pressed }) => [
              styles.editBtn,
              { backgroundColor: t.accent, opacity: pressed ? 0.85 : 1 },
            ]}>
            <Text style={styles.editLabel}>Log steps</Text>
          </Pressable>
        </View>

        <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
          <Text style={[styles.cardTitle, { color: t.muted }]}>Daily activity calories</Text>
          <Text style={[styles.bigValue, { color: t.text }]}>
            {neat.neatKcal}
            <Text style={[styles.bigUnit, { color: t.muted }]}> kcal</Text>
          </Text>
          <Text style={[styles.hint, { color: t.subtle }]}>
            From your steps + occupation baseline. Contributes to your total
            daily burn.
          </Text>
          <View style={styles.detailRows}>
            <DetailRow label="Base (occupation)" value={`${OCC_BASE[occupation]} kcal`} />
            <DetailRow label="Step bonus" value={`+${neat.neatKcal - OCC_BASE[occupation]} kcal`} />
            <DetailRow label="Net steps" value={neat.netSteps.toLocaleString()} />
            {neat.workoutSteps > 0 ? (
              <DetailRow
                label="Workout steps (excluded)"
                value={`−${neat.workoutSteps.toLocaleString()}`}
              />
            ) : null}
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
          <Text style={[styles.cardTitle, { color: t.muted }]}>Active calories</Text>
          {hc.permitted && activeKcal != null ? (
            <>
              <Text style={[styles.bigValue, { color: t.text }]}>
                {activeKcal}
                <Text style={[styles.bigUnit, { color: t.muted }]}> kcal today</Text>
              </Text>
              <Text style={[styles.hint, { color: t.subtle }]}>
                From {healthHubLabel()}. Combines workout + non-workout
                active energy reported by your wearable.
              </Text>
            </>
          ) : (
            <Text style={[styles.empty, { color: t.muted }]}>
              Connect {healthHubLabel()} to automatically track active
              calories + minutes.{'\n'}
              Target: {activeMinTarget} min/day.
            </Text>
          )}
        </View>
      </ScrollView>

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

function DetailRow({ label, value }: { label: string; value: string }) {
  const t = useTokens();
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailLabel, { color: t.muted }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: t.body }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40, gap: 14 },
  heroCard: { borderRadius: 14, borderWidth: 1, padding: 18, alignItems: 'center', gap: 8 },
  heroLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  heroValue: { fontSize: 40, fontWeight: '700', letterSpacing: -1 },
  hcHint: { fontSize: 11, fontStyle: 'italic', marginTop: -4 },
  editBtn: { borderRadius: 100, paddingHorizontal: 18, paddingVertical: 8, marginTop: 4 },
  editLabel: { color: '#fff', fontSize: 13, fontWeight: '700' },
  card: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 8 },
  cardTitle: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  bigValue: { fontSize: 22, fontWeight: '700' },
  bigUnit: { fontSize: 12, fontWeight: '500' },
  hint: { fontSize: 12 },
  detailRows: { marginTop: 8, gap: 2 },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  detailLabel: { fontSize: 12 },
  detailValue: { fontSize: 12, fontWeight: '600' },
  empty: { fontSize: 12, padding: 8, textAlign: 'center', lineHeight: 18 },
});
