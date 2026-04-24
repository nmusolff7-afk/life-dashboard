import { Slider } from '@miblanchard/react-native-slider';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import {
  DEFAULT_PREFERENCES,
  loadPreferences,
  savePreferences,
  type Preferences,
} from '../../../lib/preferences';
import { useTokens } from '../../../lib/theme';

/** Settings → Profile → Advanced. Toggles for PRD §4.4.10 features
 *  (calorie rollover, auto-adjust targets) + hydration goal slider +
 *  RMR lock. All persist to AsyncStorage preferences. */
export default function AdvancedProfile() {
  const t = useTokens();
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPreferences().then((p) => {
      setPrefs(p);
      setLoading(false);
    });
  }, []);

  const update = async <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    await savePreferences(next);
  };

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: t.bg }]}>
        <ActivityIndicator color={t.accent} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen options={{ title: 'Advanced' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.intro, { color: t.muted }]}>
          Power-user toggles. Defaults are sensible for most people — changes
          take effect on the next goal compute.
        </Text>

        <ToggleRow
          label="Calorie rollover"
          hint="Surplus or deficit from yesterday folds into today's target. Helps on big-meal days or missed-log days."
          value={prefs.calorieRollover}
          onChange={(v) => update('calorieRollover', v)}
        />

        <ToggleRow
          label="Auto-adjust targets"
          hint="Protein / carbs / fat targets shift gradually based on your 7-day trailing pattern. Off by default — most users prefer fixed targets."
          value={prefs.autoAdjustTargets}
          onChange={(v) => update('autoAdjustTargets', v)}
        />

        <ToggleRow
          label="Lock RMR"
          hint="Keeps your stored RMR fixed when you edit body stats. Turn on if you've hand-tuned it and don't want a weight change recomputing it."
          value={prefs.rmrLocked}
          onChange={(v) => update('rmrLocked', v)}
        />

        <View style={[styles.sliderCard, { backgroundColor: t.surface, borderColor: t.border }]}>
          <View style={styles.sliderHeader}>
            <Text style={[styles.sliderLabel, { color: t.text }]}>Daily water goal</Text>
            <Text style={[styles.sliderValue, { color: t.finance }]}>
              {prefs.hydrationGoalOz} oz
            </Text>
          </View>
          <Slider
            value={prefs.hydrationGoalOz}
            minimumValue={32}
            maximumValue={128}
            step={4}
            onValueChange={(v: number | number[]) => {
              const val = Array.isArray(v) ? (v[0] ?? 0) : v;
              setPrefs({ ...prefs, hydrationGoalOz: Math.round(val) });
            }}
            onSlidingComplete={(v: number | number[]) => {
              const val = Array.isArray(v) ? (v[0] ?? 0) : v;
              update('hydrationGoalOz', Math.round(val));
            }}
            minimumTrackTintColor={t.finance}
            maximumTrackTintColor={t.surface2}
            thumbTintColor={t.finance}
          />
          <Text style={[styles.sliderHint, { color: t.muted }]}>
            32–128 oz range. Default 64 oz (8 cups). Hydration tracking toggle
            is under Preferences.
          </Text>
        </View>

        <Text style={[styles.footer, { color: t.subtle }]}>
          Rollover and auto-adjust toggles persist here and will affect goal
          computation in a later build. RMR lock is respected on body-stat
          saves today.
        </Text>
      </ScrollView>
    </View>
  );
}

function ToggleRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const t = useTokens();
  return (
    <View style={[styles.toggleCard, { backgroundColor: t.surface, borderColor: t.border }]}>
      <View style={styles.toggleTop}>
        <Text style={[styles.toggleLabel, { color: t.text }]}>{label}</Text>
        <Switch
          value={value}
          onValueChange={onChange}
          trackColor={{ true: t.accent, false: t.surface2 }}
          thumbColor="#fff"
        />
      </View>
      {hint ? (
        <Text style={[styles.toggleHint, { color: t.muted }]}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, gap: 10, paddingBottom: 40 },
  intro: { fontSize: 12, lineHeight: 18, fontStyle: 'italic', marginBottom: 4 },
  toggleCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 6,
  },
  toggleTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleLabel: { fontSize: 15, fontWeight: '600', flex: 1, marginRight: 12 },
  toggleHint: { fontSize: 12, lineHeight: 17 },
  sliderCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  sliderHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sliderLabel: { fontSize: 15, fontWeight: '600' },
  sliderValue: { fontSize: 16, fontWeight: '700' },
  sliderHint: { fontSize: 11, lineHeight: 15 },
  footer: { fontSize: 11, lineHeight: 15, marginTop: 12, fontStyle: 'italic', textAlign: 'center' },
});
