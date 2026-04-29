import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { createTask } from '../../lib/hooks/useTasks';
import { useHaptics } from '../../lib/useHaptics';
import { useTokens } from '../../lib/theme';

interface Props {
  onLogged: () => void;
}

/** Time tab top-of-tab task input. Mirrors the
 *  LogMealCard / LogActivityCard pattern from Nutrition + Fitness:
 *  primary input always visible, expand for optional fields.
 *
 *  Founder INBOX 2026-04-28: "need to move task card to be top input
 *  card in time just like log a meal and log a workout are in the
 *  other 2 tabs". Plus PRD §4.6 task logging UX. */
export function LogTaskCard({ onLogged }: Props) {
  const t = useTokens();
  const haptics = useHaptics();
  const [description, setDescription] = useState('');
  const [taskTime, setTaskTime] = useState('');
  const [taskDurationMin, setTaskDurationMin] = useState('');
  const [priority, setPriority] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setDescription('');
    setTaskTime('');
    setTaskDurationMin('');
    setPriority(false);
    setShowSchedule(false);
  };

  const handleAdd = async () => {
    const desc = description.trim();
    if (!desc || saving) return;
    haptics.fire('tap');
    setSaving(true);
    try {
      const trimmedTime = taskTime.trim();
      const durationParsed = parseInt(taskDurationMin, 10);
      const duration = Number.isFinite(durationParsed) && durationParsed > 0 ? durationParsed : undefined;
      await createTask({
        description: desc,
        priority,
        task_time: trimmedTime || undefined,
        task_duration_minutes: trimmedTime ? duration : undefined,
      });
      reset();
      onLogged();
    } catch (e) {
      Alert.alert('Could not save', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const canAdd = description.trim().length > 0 && !saving;

  return (
    <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
      <View style={styles.titleRow}>
        <Ionicons name="checkbox-outline" size={16} color={t.accent} />
        <Text style={[styles.title, { color: t.text }]}>Log a task</Text>
      </View>

      <View style={styles.inputRow}>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="What's on your plate?"
          placeholderTextColor={t.subtle}
          editable={!saving}
          style={[
            styles.titleInput,
            { color: t.text, borderColor: t.border, backgroundColor: t.bg },
          ]}
          onSubmitEditing={handleAdd}
          returnKeyType="done"
        />
        <Pressable
          onPress={handleAdd}
          disabled={!canAdd}
          accessibilityLabel="Add task"
          style={[
            styles.addBtn,
            {
              backgroundColor: canAdd ? t.accent : t.surface2,
              opacity: canAdd ? 1 : 0.5,
            },
          ]}>
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="add" size={20} color="#fff" />
          )}
        </Pressable>
      </View>

      <View style={styles.optsRow}>
        <Pressable
          onPress={() => setShowSchedule((s) => !s)}
          style={[
            styles.chip,
            {
              borderColor: showSchedule ? t.accent : t.border,
              backgroundColor: showSchedule ? t.accent + '22' : 'transparent',
            },
          ]}>
          <Ionicons
            name="time-outline"
            size={13}
            color={showSchedule ? t.accent : t.muted}
          />
          <Text
            style={[
              styles.chipLabel,
              { color: showSchedule ? t.accent : t.muted },
            ]}>
            {taskTime ? taskTime : 'Schedule'}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setPriority((p) => !p)}
          style={[
            styles.chip,
            {
              borderColor: priority ? t.danger : t.border,
              backgroundColor: priority ? t.danger + '22' : 'transparent',
            },
          ]}>
          <Ionicons
            name={priority ? 'flag' : 'flag-outline'}
            size={13}
            color={priority ? t.danger : t.muted}
          />
          <Text
            style={[
              styles.chipLabel,
              { color: priority ? t.danger : t.muted },
            ]}>
            Priority
          </Text>
        </Pressable>
      </View>

      {showSchedule ? (
        <View style={styles.scheduleRow}>
          <TextInput
            value={taskTime}
            onChangeText={setTaskTime}
            placeholder="14:30"
            placeholderTextColor={t.subtle}
            autoCapitalize="none"
            autoCorrect={false}
            style={[
              styles.smallInput,
              { color: t.text, borderColor: t.border, backgroundColor: t.bg, flex: 1 },
            ]}
          />
          <TextInput
            value={taskDurationMin}
            onChangeText={setTaskDurationMin}
            placeholder="30 min"
            placeholderTextColor={t.subtle}
            keyboardType="numeric"
            style={[
              styles.smallInput,
              { color: t.text, borderColor: t.border, backgroundColor: t.bg, flex: 1 },
            ]}
          />
        </View>
      ) : null}

      {showSchedule && taskTime ? (
        <Text style={[styles.hint, { color: t.subtle }]}>
          Will appear on your Day Timeline.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    gap: 10,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: { fontSize: 13, fontWeight: '700' },

  inputRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  titleInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },

  optsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 100,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  chipLabel: { fontSize: 11, fontWeight: '600' },

  scheduleRow: { flexDirection: 'row', gap: 8 },
  smallInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
  },
  hint: { fontSize: 10, fontStyle: 'italic' },
});
