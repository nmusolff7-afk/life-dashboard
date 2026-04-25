import { Stack } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { SegmentedControl } from '../../components/ui';
import {
  type Aggressiveness,
  DEFAULT_NOTIFICATIONS,
  formatQuietHour,
  loadNotificationPrefs,
  type NotificationPrefs,
  saveNotificationPrefs,
} from '../../lib/settingsPrefs';
import { useTokens } from '../../lib/theme';

/** PRD §4.8.8 category taxonomy. Non-account categories are toggleable;
 *  accountBilling is always-on (security + payment). */
const CATEGORIES: {
  key: keyof Omit<NotificationPrefs['categories'], 'accountBilling'>;
  label: string;
  description: string;
}[] = [
  { key: 'fitness', label: 'Fitness', description: 'Workout reminders, plan progression, PR milestones' },
  { key: 'nutrition', label: 'Nutrition', description: 'Meal-log nudges, protein pace, hydration' },
  { key: 'finance', label: 'Finance', description: 'Budget checkpoints, bills due, unusual spend' },
  { key: 'life', label: 'Life', description: 'Goal milestones, unreplied email, weekly summary' },
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

  const update = async (patch: Partial<NotificationPrefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    await saveNotificationPrefs(next);
  };
  const updateCategory = async (
    key: keyof Omit<NotificationPrefs['categories'], 'accountBilling'>,
    value: boolean,
  ) => {
    await update({ categories: { ...prefs.categories, [key]: value } });
  };
  const updateQuiet = async (patch: Partial<NotificationPrefs['quietHours']>) => {
    await update({ quietHours: { ...prefs.quietHours, ...patch } });
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
            <Section label="Aggressiveness" hint={
              prefs.aggressiveness === 'quiet'
                ? 'Critical alerts only — payments, security, expired connectors.'
                : prefs.aggressiveness === 'balanced'
                  ? 'Reminders + milestones, no nudges.'
                  : 'Every prompt + recovery reminders.'
            }>
              <SegmentedControl<Aggressiveness>
                value={prefs.aggressiveness}
                onChange={(v) => update({ aggressiveness: v })}
                options={[
                  { value: 'quiet', label: 'Quiet' },
                  { value: 'balanced', label: 'Balanced' },
                  { value: 'active', label: 'Active' },
                ]}
              />
            </Section>

            <Section label="Categories" hint="Account & billing alerts can't be disabled.">
              {CATEGORIES.map((c) => (
                <View key={c.key} style={[styles.row, { backgroundColor: t.surface, borderColor: t.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.name, { color: t.text }]}>{c.label}</Text>
                    <Text style={[styles.sub, { color: t.muted }]}>{c.description}</Text>
                  </View>
                  <Switch
                    value={prefs.categories[c.key]}
                    onValueChange={(v) => updateCategory(c.key, v)}
                    trackColor={{ true: t.accent, false: t.surface2 }}
                    thumbColor="#fff"
                  />
                </View>
              ))}
              <View style={[styles.row, { backgroundColor: t.surface, borderColor: t.border, opacity: 0.75 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: t.text }]}>Account & billing</Text>
                  <Text style={[styles.sub, { color: t.muted }]}>Payment failures, security events. Always on.</Text>
                </View>
                <Switch value disabled trackColor={{ true: t.accent, false: t.surface2 }} thumbColor="#fff" />
              </View>
            </Section>

            <Section label="Privacy" hint="Hides dollar amounts from lock-screen previews of finance notifications.">
              <View style={[styles.row, { backgroundColor: t.surface, borderColor: t.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: t.text }]}>Show amounts</Text>
                  <Text style={[styles.sub, { color: t.muted }]}>
                    {prefs.showAmounts
                      ? 'Amounts visible on your lock screen.'
                      : 'Amounts hidden — notifications say "Bill due" instead of "$1,240 due Friday".'}
                  </Text>
                </View>
                <Switch
                  value={prefs.showAmounts}
                  onValueChange={(v) => update({ showAmounts: v })}
                  trackColor={{ true: t.accent, false: t.surface2 }}
                  thumbColor="#fff"
                />
              </View>
            </Section>

            <QuietHoursSection prefs={prefs.quietHours} onChange={updateQuiet} />

            <Text style={[styles.fineprint, { color: t.subtle }]}>
              Preferences saved on this device. They're honored when push notifications send — the actual send path activates with the notifications permission wired up in Onboarding.
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function QuietHoursSection({
  prefs,
  onChange,
}: {
  prefs: NotificationPrefs['quietHours'];
  onChange: (patch: Partial<NotificationPrefs['quietHours']>) => void | Promise<void>;
}) {
  const t = useTokens();
  // Coarse-grained hour stepper. Full date/time picker would be nicer
  // but pulls a native dep; 1h resolution is sufficient for quiet hours.
  const stepStart = (delta: number) =>
    onChange({ startMinute: (prefs.startMinute + delta + 1440) % 1440 });
  const stepEnd = (delta: number) =>
    onChange({ endMinute: (prefs.endMinute + delta + 1440) % 1440 });
  const wraps = prefs.endMinute <= prefs.startMinute;
  const durationMinutes = wraps
    ? 1440 - prefs.startMinute + prefs.endMinute
    : prefs.endMinute - prefs.startMinute;
  const hours = Math.round(durationMinutes / 60);

  return (
    <Section label="Quiet hours" hint={
      prefs.enabled
        ? `Active from ${formatQuietHour(prefs.startMinute)} to ${formatQuietHour(prefs.endMinute)} · ${hours}h window${wraps ? ' (wraps midnight)' : ''}.`
        : 'No notifications suppressed by time of day.'
    }>
      <View style={[styles.row, { backgroundColor: t.surface, borderColor: t.border }]}>
        <Text style={[styles.name, { color: t.text }]}>Enable quiet hours</Text>
        <Switch
          value={prefs.enabled}
          onValueChange={(v) => onChange({ enabled: v })}
          trackColor={{ true: t.accent, false: t.surface2 }}
          thumbColor="#fff"
        />
      </View>
      {prefs.enabled ? (
        <>
          <TimeStepperRow
            label="From"
            value={prefs.startMinute}
            onDec={() => stepStart(-60)}
            onInc={() => stepStart(60)}
          />
          <TimeStepperRow
            label="To"
            value={prefs.endMinute}
            onDec={() => stepEnd(-60)}
            onInc={() => stepEnd(60)}
          />
          <View style={[styles.row, { backgroundColor: t.surface, borderColor: t.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.name, { color: t.text }]}>Critical alerts override</Text>
              <Text style={[styles.sub, { color: t.muted }]}>
                Payment failures and security events still fire during quiet hours.
              </Text>
            </View>
            <Switch
              value={prefs.criticalOverride}
              onValueChange={(v) => onChange({ criticalOverride: v })}
              trackColor={{ true: t.accent, false: t.surface2 }}
              thumbColor="#fff"
            />
          </View>
          {Platform.OS === 'ios' ? (
            <Text style={[styles.sub, { color: t.subtle, paddingHorizontal: 2 }]}>
              iOS "Focus" and "Do Not Disturb" modes take precedence over this setting.
            </Text>
          ) : null}
        </>
      ) : null}
    </Section>
  );
}

function TimeStepperRow({
  label, value, onDec, onInc,
}: { label: string; value: number; onDec: () => void; onInc: () => void }) {
  const t = useTokens();
  return (
    <View style={[styles.row, { backgroundColor: t.surface, borderColor: t.border }]}>
      <Text style={[styles.name, { color: t.text }]}>{label}</Text>
      <View style={styles.stepper}>
        <Pressable onPress={onDec} hitSlop={10} style={[styles.stepBtn, { borderColor: t.border }]}>
          <Text style={[styles.stepBtnText, { color: t.text }]}>−1h</Text>
        </Pressable>
        <Text style={[styles.timeText, { color: t.text }]}>{formatQuietHour(value)}</Text>
        <Pressable onPress={onInc} hitSlop={10} style={[styles.stepBtn, { borderColor: t.border }]}>
          <Text style={[styles.stepBtnText, { color: t.text }]}>+1h</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Section({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  const t = useTokens();
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionLabel, { color: t.muted }]}>{label}</Text>
      {children}
      {hint ? <Text style={[styles.hint, { color: t.subtle }]}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 18, paddingBottom: 40 },
  section: { gap: 8 },
  sectionLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  hint: { fontSize: 12, marginTop: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  name: { fontSize: 14, fontWeight: '600' },
  sub: { fontSize: 12, marginTop: 2 },
  fineprint: { fontSize: 11, lineHeight: 15, marginTop: 12, fontStyle: 'italic' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBtn: { borderWidth: 1, borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10 },
  stepBtnText: { fontSize: 13, fontWeight: '600' },
  timeText: { fontSize: 16, fontWeight: '700', minWidth: 54, textAlign: 'center' },
});
