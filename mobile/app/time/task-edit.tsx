import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import type { Task } from '../../../shared/src/types/tasks';
import { Button } from '../../components/ui';
import { apiFetch } from '../../lib/api';
import { deleteTask, updateTask } from '../../lib/hooks/useTasks';
import { useTokens } from '../../lib/theme';

export default function TaskEditScreen() {
  const t = useTokens();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const taskId = parseInt(id ?? '0', 10);

  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!taskId) { setLoading(false); return; }
      try {
        // No single-get endpoint; list and pluck.
        const res = await apiFetch('/api/mind/tasks');
        const json = await res.json();
        const found = (json.tasks ?? []).find((x: Task) => x.id === taskId) as Task | undefined;
        if (cancelled || !found) { setLoading(false); return; }
        setTask(found);
        setDescription(found.description);
        setDueDate(found.due_date ?? '');
        setPriority(!!found.priority);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [taskId]);

  const canSave =
    task != null &&
    description.trim().length > 0 &&
    (description.trim() !== task.description ||
      (dueDate || null) !== (task.due_date ?? null) ||
      priority !== !!task.priority);

  const onSave = async () => {
    if (!task || !canSave) return;
    setSaving(true);
    try {
      await updateTask(task.id, {
        description: description.trim(),
        due_date: dueDate.trim() || null,
        priority,
      });
      router.back();
    } catch (e) {
      Alert.alert('Could not save', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const onDelete = () => {
    if (!task) return;
    Alert.alert('Delete task?', description, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await deleteTask(task.id); router.back(); }
        catch (e) { Alert.alert('Could not delete', (e as Error).message); }
      } },
    ]);
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: t.bg }]}>
        <ActivityIndicator color={t.accent} />
      </View>
    );
  }
  if (!task) {
    return (
      <View style={[styles.center, { backgroundColor: t.bg }]}>
        <Text style={{ color: t.muted }}>Task not found.</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen options={{ title: 'Edit task' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.label, { color: t.muted }]}>Description</Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          multiline
          style={[styles.input, styles.multiline, { color: t.text, borderColor: t.border, backgroundColor: t.surface }]}
        />

        <Text style={[styles.label, { color: t.muted, marginTop: 14 }]}>Due date (YYYY-MM-DD)</Text>
        <TextInput
          value={dueDate}
          onChangeText={setDueDate}
          placeholder="leave blank for no deadline"
          placeholderTextColor={t.subtle}
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.surface }]}
        />

        <View style={[styles.priorityRow, { backgroundColor: t.surface, borderColor: t.border, marginTop: 14 }]}>
          <Text style={[styles.priorityLabel, { color: t.text, flex: 1 }]}>Priority task</Text>
          <Switch
            value={priority}
            onValueChange={setPriority}
            trackColor={{ true: t.accent, false: t.surface2 }}
            thumbColor="#fff"
          />
        </View>

        <Button
          title={saving ? 'Saving…' : 'Save changes'}
          onPress={onSave}
          disabled={!canSave || saving}
          style={{ marginTop: 20 }}
        />
        <Button
          title="Delete task"
          variant="danger"
          onPress={onDelete}
          style={{ marginTop: 10 }}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  priorityRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderRadius: 14, padding: 14,
  },
  priorityLabel: { fontSize: 14, fontWeight: '700' },
});
