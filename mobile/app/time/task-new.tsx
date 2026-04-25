import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { Button } from '../../components/ui';
import { createTask } from '../../lib/hooks/useTasks';
import { useTokens } from '../../lib/theme';

export default function TaskNewScreen() {
  const t = useTokens();
  const router = useRouter();
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState(false);
  const [saving, setSaving] = useState(false);

  const canSave = description.trim().length > 0;

  const onSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await createTask({
        description: description.trim(),
        due_date: dueDate.trim() || undefined,
        priority,
      });
      router.back();
    } catch (e) {
      Alert.alert('Could not save', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen options={{ title: 'New task' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.label, { color: t.muted }]}>Description</Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="e.g. Submit expense report"
          placeholderTextColor={t.subtle}
          multiline
          style={[styles.input, styles.multiline, { color: t.text, borderColor: t.border, backgroundColor: t.surface }]}
        />

        <Text style={[styles.label, { color: t.muted, marginTop: 14 }]}>Due date (YYYY-MM-DD, optional)</Text>
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
          <View style={{ flex: 1 }}>
            <Text style={[styles.priorityLabel, { color: t.text }]}>Priority task</Text>
            <Text style={[styles.prioritySub, { color: t.muted }]}>
              Priority tasks rank higher in Today's Focus and feed the TIME-01 "priority streak" goal.
            </Text>
          </View>
          <Switch
            value={priority}
            onValueChange={setPriority}
            trackColor={{ true: t.accent, false: t.surface2 }}
            thumbColor="#fff"
          />
        </View>

        <Button
          title={saving ? 'Saving…' : 'Add task'}
          onPress={onSave}
          disabled={!canSave || saving}
          style={{ marginTop: 20 }}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 48 },
  label: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  priorityRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderRadius: 14, padding: 14,
  },
  priorityLabel: { fontSize: 14, fontWeight: '700' },
  prioritySub: { fontSize: 12, marginTop: 2 },
});
