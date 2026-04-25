import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { Button } from '../../components/ui';
import type { Goal, GoalPaceIndicator } from '../../../shared/src/types/goals';
import { archiveGoal, completeGoal, unarchiveGoal, updateGoal, useGoalDetail } from '../../lib/hooks/useGoals';
import { useTokens } from '../../lib/theme';

const PACE_COLOR: Record<GoalPaceIndicator, string> = {
  ahead: '#5AB8FF',
  on_track: '#22C55E',
  behind: '#F59E0B',
  neutral: '#9CA3AF',
  paused: '#F97316',
  complete: '#22C55E',
  broken: '#F59E0B',
};

export default function GoalDetailScreen() {
  const t = useTokens();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const goalId = parseInt(id ?? '0', 10);
  const detail = useGoalDetail(goalId || null);
  const [editing, setEditing] = useState(false);

  if (detail.loading && !detail.data) {
    return <View style={[styles.center, { backgroundColor: t.bg }]}><ActivityIndicator color={t.accent} /></View>;
  }
  const goal = detail.data?.goal;
  if (!goal) {
    return (
      <View style={[styles.center, { backgroundColor: t.bg }]}>
        <Text style={{ color: t.muted }}>Goal not found.</Text>
      </View>
    );
  }

  const pct = Math.max(0, Math.min(1, goal.progress_pct ?? 0));
  const pace = goal.pace;
  const paceColor = pace ? PACE_COLOR[pace.indicator] : PACE_COLOR.neutral;
  const isActive = goal.status === 'active';
  const isArchived = goal.status === 'archived';
  const isCompleted = goal.status === 'completed';

  const onArchive = () => {
    Alert.alert('Archive goal?', 'You can restore it later from the archived list.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Archive', style: 'destructive', onPress: async () => {
        try { await archiveGoal(goal.goal_id); router.replace('/goals' as never); }
        catch (e) { Alert.alert('Could not archive', (e as Error).message); }
      } },
    ]);
  };
  const onUnarchive = async () => {
    try { await unarchiveGoal(goal.goal_id); await detail.refetch(); }
    catch (e) { Alert.alert('Could not restore', (e as Error).message); }
  };
  const onComplete = () => {
    Alert.alert('Mark as complete?', 'Moves this goal to the completed list.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Complete', onPress: async () => {
        try { await completeGoal(goal.goal_id); await detail.refetch(); }
        catch (e) { Alert.alert('Could not complete', (e as Error).message); }
      } },
    ]);
  };

  return (
    <View style={[styles.container, { backgroundColor: t.bg }]}>
      <Stack.Screen options={{ title: goal.display_name, headerStyle: { backgroundColor: t.bg }, headerTintColor: t.text, headerShadowVisible: false, headerBackTitle: 'Goals' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.eyebrow, { color: t.subtle }]}>{goal.library_id} · {goal.goal_type.replace(/_/g, ' ')}</Text>
        <Text style={[styles.title, { color: t.text }]}>{goal.display_name}</Text>

        <View style={[styles.paceCard, { backgroundColor: t.surface, borderColor: paceColor }]}>
          <Text style={[styles.paceValue, { color: paceColor }]}>
            {goal.progress_pct != null ? `${Math.round(pct * 100)}%` : '—'}
          </Text>
          <Text style={[styles.paceLabel, { color: t.muted }]}>{pace?.label || goal.status}</Text>
          {goal.progress_pct != null && (
            <View style={[styles.progressTrack, { backgroundColor: t.border }]}>
              <View style={[styles.progressFill, { width: `${pct * 100}%`, backgroundColor: paceColor }]} />
            </View>
          )}
        </View>

        <GoalStats goal={goal} />

        <View style={styles.actions}>
          {!editing && isActive && (
            <Button title="Edit" onPress={() => setEditing(true)} variant="secondary" />
          )}
          {isActive && (
            <Pressable onPress={onComplete} style={[styles.actionRow, { borderColor: t.border, backgroundColor: t.surface }]}>
              <Text style={[styles.actionText, { color: t.text }]}>Mark complete</Text>
            </Pressable>
          )}
          {isActive && (
            <Pressable onPress={onArchive} style={[styles.actionRow, { borderColor: t.border, backgroundColor: t.surface }]}>
              <Text style={[styles.actionText, { color: '#F59E0B' }]}>Archive</Text>
            </Pressable>
          )}
          {isArchived && (
            <Pressable onPress={onUnarchive} style={[styles.actionRow, { borderColor: t.border, backgroundColor: t.surface }]}>
              <Text style={[styles.actionText, { color: t.accent }]}>Restore to active</Text>
            </Pressable>
          )}
          {isCompleted && (
            <Text style={[styles.completedLabel, { color: t.muted }]}>
              ✓ Completed {goal.completed_at ? `on ${goal.completed_at.slice(0, 10)}` : ''}
            </Text>
          )}
        </View>

        {editing && <EditSheet goal={goal} onDone={async () => { setEditing(false); await detail.refetch(); }} />}
      </ScrollView>
    </View>
  );
}

function GoalStats({ goal }: { goal: Goal }) {
  const t = useTokens();
  const rows: { label: string; value: string }[] = [];
  if (goal.goal_type === 'cumulative_numeric') {
    rows.push({ label: 'Target', value: String(goal.target_value ?? '—') });
    rows.push({ label: 'Current', value: String(goal.current_value ?? '—') });
    rows.push({ label: 'Start', value: String(goal.start_value ?? '—') });
    rows.push({ label: 'Deadline', value: goal.deadline ?? '—' });
  } else if (goal.goal_type === 'streak') {
    rows.push({ label: 'Target', value: `${goal.target_streak_length ?? 0}` });
    rows.push({ label: 'Current streak', value: `${goal.current_streak_length ?? 0}` });
    rows.push({ label: 'Unit', value: goal.period_unit ?? 'day' });
  } else if (goal.goal_type === 'best_attempt') {
    rows.push({ label: 'Target', value: String(goal.target_value ?? '—') });
    rows.push({ label: 'Current best', value: String(goal.best_attempt_value ?? '—') });
    rows.push({ label: 'Baseline', value: String(goal.baseline_value ?? '—') });
  } else if (goal.goal_type === 'rate') {
    rows.push({ label: 'Target rate', value: String(goal.target_rate ?? '—') });
    rows.push({ label: 'Current', value: goal.current_rate != null ? goal.current_rate.toFixed(1) : '—' });
    rows.push({ label: 'Window', value: `${goal.window_size ?? 30} periods` });
  } else if (goal.goal_type === 'period_count') {
    rows.push({ label: 'Target', value: String(goal.target_count ?? '—') });
    rows.push({ label: 'Current', value: String(goal.current_count ?? 0) });
    rows.push({ label: 'Period', value: `${goal.period_start} → ${goal.period_end}` });
  }

  return (
    <View style={[styles.stats, { backgroundColor: t.surface, borderColor: t.border }]}>
      {rows.map((r) => (
        <View key={r.label} style={[styles.statRow, { borderTopColor: t.border }]}>
          <Text style={[styles.statLabel, { color: t.muted }]}>{r.label}</Text>
          <Text style={[styles.statValue, { color: t.text }]}>{r.value}</Text>
        </View>
      ))}
    </View>
  );
}

function EditSheet({ goal, onDone }: { goal: Goal; onDone: () => void | Promise<void> }) {
  const t = useTokens();
  const [displayName, setDisplayName] = useState(goal.display_name);
  const [targetValue, setTargetValue] = useState(goal.target_value != null ? String(goal.target_value) : '');
  const [targetStreak, setTargetStreak] = useState(goal.target_streak_length != null ? String(goal.target_streak_length) : '');
  const [targetCount, setTargetCount] = useState(goal.target_count != null ? String(goal.target_count) : '');
  const [targetRate, setTargetRate] = useState(goal.target_rate != null ? String(goal.target_rate) : '');
  const [deadline, setDeadline] = useState(goal.deadline ?? '');
  const [isPrimary, setIsPrimary] = useState(!!goal.is_primary);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {};
      if (displayName && displayName !== goal.display_name) payload.display_name = displayName;
      if (goal.goal_type === 'cumulative_numeric' || goal.goal_type === 'best_attempt') {
        if (targetValue) payload.target_value = parseFloat(targetValue);
      }
      if (goal.goal_type === 'streak' && targetStreak) payload.target_streak_length = parseInt(targetStreak, 10);
      if (goal.goal_type === 'period_count' && targetCount) payload.target_count = parseInt(targetCount, 10);
      if (goal.goal_type === 'rate' && targetRate) payload.target_rate = parseFloat(targetRate);
      if (goal.goal_type === 'cumulative_numeric' && deadline) payload.deadline = deadline;
      if (goal.category === 'fitness' && goal.affects_calorie_math === 1) payload.is_primary = isPrimary;
      await updateGoal(goal.goal_id, payload as never);
      await onDone();
    } catch (e) {
      Alert.alert('Could not save', (e as Error).message);
    } finally { setBusy(false); }
  };

  return (
    <View style={[styles.editSheet, { backgroundColor: t.surface, borderColor: t.border }]}>
      <Text style={[styles.editHeader, { color: t.text }]}>Edit</Text>
      <Text style={[styles.editLabel, { color: t.muted }]}>Display name</Text>
      <TextInput style={[styles.editInput, { color: t.text, borderColor: t.border }]} value={displayName} onChangeText={setDisplayName} />

      {(goal.goal_type === 'cumulative_numeric' || goal.goal_type === 'best_attempt') && (
        <>
          <Text style={[styles.editLabel, { color: t.muted, marginTop: 10 }]}>Target</Text>
          <TextInput style={[styles.editInput, { color: t.text, borderColor: t.border }]} value={targetValue} onChangeText={setTargetValue} keyboardType="numeric" />
        </>
      )}
      {goal.goal_type === 'streak' && (
        <>
          <Text style={[styles.editLabel, { color: t.muted, marginTop: 10 }]}>Target streak length</Text>
          <TextInput style={[styles.editInput, { color: t.text, borderColor: t.border }]} value={targetStreak} onChangeText={setTargetStreak} keyboardType="numeric" />
        </>
      )}
      {goal.goal_type === 'period_count' && (
        <>
          <Text style={[styles.editLabel, { color: t.muted, marginTop: 10 }]}>Target count</Text>
          <TextInput style={[styles.editInput, { color: t.text, borderColor: t.border }]} value={targetCount} onChangeText={setTargetCount} keyboardType="numeric" />
        </>
      )}
      {goal.goal_type === 'rate' && (
        <>
          <Text style={[styles.editLabel, { color: t.muted, marginTop: 10 }]}>Target rate</Text>
          <TextInput style={[styles.editInput, { color: t.text, borderColor: t.border }]} value={targetRate} onChangeText={setTargetRate} keyboardType="numeric" />
        </>
      )}
      {goal.goal_type === 'cumulative_numeric' && (
        <>
          <Text style={[styles.editLabel, { color: t.muted, marginTop: 10 }]}>Deadline (YYYY-MM-DD)</Text>
          <TextInput style={[styles.editInput, { color: t.text, borderColor: t.border }]} value={deadline} onChangeText={setDeadline} />
        </>
      )}
      {goal.category === 'fitness' && goal.affects_calorie_math === 1 && (
        <View style={styles.primaryRow}>
          <Text style={[styles.editLabel, { color: t.muted }]}>Primary fitness goal</Text>
          <Switch value={isPrimary} onValueChange={setIsPrimary} />
        </View>
      )}

      <Button title={busy ? 'Saving…' : 'Save'} onPress={save} disabled={busy} style={{ marginTop: 14 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 48 },
  eyebrow: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  title: { fontSize: 24, fontWeight: '800', marginTop: 4 },
  paceCard: { borderWidth: 2, borderRadius: 20, padding: 20, alignItems: 'center', gap: 8, marginTop: 16 },
  paceValue: { fontSize: 44, fontWeight: '800' },
  paceLabel: { fontSize: 13, fontWeight: '500' },
  progressTrack: { width: '100%', height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 8 },
  progressFill: { height: '100%', borderRadius: 4 },
  stats: { borderWidth: 1, borderRadius: 16, marginTop: 16 },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 12, borderTopWidth: StyleSheet.hairlineWidth },
  statLabel: { fontSize: 13 },
  statValue: { fontSize: 13, fontWeight: '600' },
  actions: { marginTop: 24, gap: 10 },
  actionRow: { borderWidth: 1, borderRadius: 14, padding: 14, alignItems: 'center' },
  actionText: { fontSize: 14, fontWeight: '600' },
  completedLabel: { fontSize: 14, textAlign: 'center', marginTop: 10 },
  editSheet: { borderWidth: 1, borderRadius: 16, padding: 14, marginTop: 18, gap: 2 },
  editHeader: { fontSize: 14, fontWeight: '700', marginBottom: 6 },
  editLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, marginTop: 4 },
  editInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14 },
  primaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
});
