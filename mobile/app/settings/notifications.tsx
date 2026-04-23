import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { SegmentedControl } from '../../components/ui';
import {
  type Aggressiveness,
  DEFAULT_NOTIFICATIONS,
  loadNotificationPrefs,
  type NotificationPrefs,
  saveNotificationPrefs,
} from '../../lib/settingsPrefs';
import { useTokens } from '../../lib/theme';

const CATEGORIES: { key: keyof NotificationPrefs['categories']; label: string }[] = [
  { key: 'mealReminders',  label: 'Meal reminders' },
  { key: 'goalMilestones', label: 'Goal milestones' },
  { key: 'unrepliedEmail', label: 'Unreplied email' },
  { key: 'billsDue',       label: 'Bills due' },
  { key: 'workoutPrompt',  label: 'Workout prompt' },
  { key: 'weeklySummary',  label: 'Weekly summary' },
];

export default function Notifications() {
  const t = useTokens();
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIFICATIONS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadNotificationPrefs().then((p) => {
      setPrefs(p);
      setLoading(false);
    });
  }, []);

  const updateAggressiveness = async (v: Aggressiveness) => {
    const next = { ...prefs, aggressiveness: v };
    setPrefs(next);
    await saveNotificationPrefs(next);
  };

  const updateCategory = async (key: keyof NotificationPrefs['categories'], value: boolean) => {
    const next = { ...prefs, categories: { ...prefs.categories, [key]: value } };
    setPrefs(next);
    await saveNotificationPrefs(next);
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen
        options={{
          title: 'Notifications',
          headerStyle: { backgroundColor: t.bg },
          headerTintColor: t.text,
          headerShadowVisible: false,
        }}
      />
      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <ActivityIndicator color={t.accent} />
        ) : (
          <>
            <Section label="Aggressiveness">
              <SegmentedControl<Aggressiveness>
                value={prefs.aggressiveness}
                onChange={updateAggressiveness}
                options={[
                  { value: 'quiet', label: 'Quiet' },
                  { value: 'balanced', label: 'Balanced' },
                  { value: 'active', label: 'Active' },
                ]}
              />
              <Text style={[styles.hint, { color: t.subtle }]}>
                {prefs.aggressiveness === 'quiet'
                  ? 'Critical alerts only.'
                  : prefs.aggressiveness === 'balanced'
                    ? 'Reminders + milestones, no nudges.'
                    : 'Every prompt + recovery reminders.'}
              </Text>
            </Section>

            <Section label="Categories">
              {CATEGORIES.map((c) => (
                <View
                  key={c.key}
                  style={[styles.row, { backgroundColor: t.surface, borderColor: t.border }]}>
                  <Text style={[styles.name, { color: t.text }]}>{c.label}</Text>
                  <Switch
                    value={prefs.categories[c.key]}
                    onValueChange={(v) => updateCategory(c.key, v)}
                    trackColor={{ true: t.accent, false: t.surface2 }}
                    thumbColor="#fff"
                  />
                </View>
              ))}
            </Section>

            <Section label="Quiet hours">
              <View style={[styles.row, { backgroundColor: t.surface, borderColor: t.border }]}>
                <Text style={[styles.name, { color: t.subtle }]}>
                  Quiet-hours scheduler ships with push-notification permission flow.
                </Text>
              </View>
            </Section>

            <Text style={[styles.fineprint, { color: t.subtle }]}>
              Settings saved locally. Push-notification permission prompt + wiring to
              expo-notifications lands in a later phase.
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  const t = useTokens();
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionLabel, { color: t.muted }]}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 18, paddingBottom: 40 },
  section: { gap: 8 },
  sectionLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  hint: { fontSize: 12, marginTop: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  name: { fontSize: 14, fontWeight: '500', flex: 1 },
  fineprint: { fontSize: 11, lineHeight: 15, marginTop: 8 },
});
