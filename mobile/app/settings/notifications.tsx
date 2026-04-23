import { Stack } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { SegmentedControl } from '../../components/ui';
import { useTokens } from '../../lib/theme';

type Aggressiveness = 'quiet' | 'balanced' | 'active';

const CATEGORIES = ['Meal reminders', 'Goal milestones', 'Unreplied email', 'Bills due', 'Workout prompt', 'Weekly summary'];

export default function Notifications() {
  const t = useTokens();
  const [level, setLevel] = useState<Aggressiveness>('balanced');
  const [cats, setCats] = useState<Record<string, boolean>>(
    Object.fromEntries(CATEGORIES.map((c) => [c, true])),
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen options={{ title: 'Notifications' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.sectionLabel, { color: t.muted }]}>Aggressiveness</Text>
        <SegmentedControl<Aggressiveness>
          value={level}
          onChange={setLevel}
          options={[
            { value: 'quiet', label: 'Quiet' },
            { value: 'balanced', label: 'Balanced' },
            { value: 'active', label: 'Active' },
          ]}
        />

        <Text style={[styles.sectionLabel, { color: t.muted, marginTop: 16 }]}>Categories</Text>
        {CATEGORIES.map((c) => (
          <View key={c} style={[styles.row, { backgroundColor: t.surface, borderColor: t.border }]}>
            <Text style={[styles.name, { color: t.text }]}>{c}</Text>
            <Switch
              value={!!cats[c]}
              onValueChange={(v) => setCats((prev) => ({ ...prev, [c]: v }))}
              trackColor={{ true: t.accent, false: t.surface2 }}
            />
          </View>
        ))}

        <Text style={[styles.sectionLabel, { color: t.muted, marginTop: 16 }]}>Quiet hours</Text>
        <View style={[styles.row, { backgroundColor: t.surface, borderColor: t.border }]}>
          <Text style={[styles.name, { color: t.subtle }]}>Configure quiet hours — stub</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 8, paddingBottom: 40 },
  sectionLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 14, padding: 14 },
  name: { fontSize: 14, fontWeight: '500', flex: 1 },
});
