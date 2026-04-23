import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { clearOverrides, DEFAULT_OVERRIDES, loadOverrides, saveOverrides, type Overrides } from '../../lib/overrides';
import { useTokens } from '../../lib/theme';

const MACROS: { key: keyof Overrides['macrosLocked']; label: string; color: 'protein' | 'carbs' | 'fat' | 'sugar' | 'fiber' | 'sodium' }[] = [
  { key: 'protein', label: 'Protein', color: 'protein' },
  { key: 'carbs',   label: 'Carbs',   color: 'carbs' },
  { key: 'fat',     label: 'Fat',     color: 'fat' },
  { key: 'sugar',   label: 'Sugar',   color: 'sugar' },
  { key: 'fiber',   label: 'Fiber',   color: 'fiber' },
  { key: 'sodium',  label: 'Sodium',  color: 'sodium' },
];

/** Per PRD §4.8.3 — client-side locks that tell forms elsewhere to respect a
 *  manual override instead of overwriting with a fresh suggestion. Stored in
 *  AsyncStorage; Flask has no backend column for this. */
export function AdvancedOverridesForm() {
  const t = useTokens();
  const [state, setState] = useState<Overrides>(DEFAULT_OVERRIDES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rmrInput, setRmrInput] = useState('');
  const [neatInput, setNeatInput] = useState('');

  useEffect(() => {
    loadOverrides().then((o) => {
      setState(o);
      if (o.rmrKcal != null) setRmrInput(String(o.rmrKcal));
      if (o.neatKcal != null) setNeatInput(String(o.neatKcal));
      setLoading(false);
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const rmr = parseFloat(rmrInput);
      const neat = parseFloat(neatInput);
      const next: Overrides = {
        ...state,
        rmrKcal: state.rmrLocked && Number.isFinite(rmr) && rmr > 0 ? Math.round(rmr) : null,
        neatKcal: state.neatLocked && Number.isFinite(neat) && neat > 0 ? Math.round(neat) : null,
      };
      await saveOverrides(next);
      setState(next);
      Alert.alert('Saved', 'Locks apply the next time you open a profile form that respects overrides.');
    } catch (e) {
      Alert.alert('Save failed', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    Alert.alert('Clear all overrides?', 'This removes every RMR / NEAT / macro lock. Cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          await clearOverrides();
          setState(DEFAULT_OVERRIDES);
          setRmrInput('');
          setNeatInput('');
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={t.accent} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={[styles.explainer, { backgroundColor: t.surface, borderColor: t.border }]}>
        <Ionicons name="lock-closed-outline" size={18} color={t.accent} />
        <Text style={[styles.explainerText, { color: t.muted }]}>
          Locks tell the profile forms to keep your manual value when you tap "Apply suggested"
          elsewhere. Leave everything unlocked if you want suggestions to flow through
          normally.
        </Text>
      </View>

      {/* RMR override */}
      <Section title="RMR override">
        <LockRow
          label="Lock RMR"
          value={state.rmrLocked}
          onChange={(v) => setState((s) => ({ ...s, rmrLocked: v }))}
        />
        <TextInput
          value={rmrInput}
          onChangeText={setRmrInput}
          keyboardType="number-pad"
          placeholder="1800"
          placeholderTextColor={t.subtle}
          editable={state.rmrLocked}
          style={[
            styles.input,
            {
              color: t.text,
              backgroundColor: t.surface2,
              borderColor: t.border,
              opacity: state.rmrLocked ? 1 : 0.4,
            },
          ]}
        />
        <Text style={[styles.helper, { color: t.subtle }]}>
          kcal/day. Replaces Mifflin / Katch-McArdle when locked.
        </Text>
      </Section>

      {/* NEAT override */}
      <Section title="NEAT override">
        <LockRow
          label="Lock NEAT"
          value={state.neatLocked}
          onChange={(v) => setState((s) => ({ ...s, neatLocked: v }))}
        />
        <TextInput
          value={neatInput}
          onChangeText={setNeatInput}
          keyboardType="number-pad"
          placeholder="500"
          placeholderTextColor={t.subtle}
          editable={state.neatLocked}
          style={[
            styles.input,
            {
              color: t.text,
              backgroundColor: t.surface2,
              borderColor: t.border,
              opacity: state.neatLocked ? 1 : 0.4,
            },
          ]}
        />
        <Text style={[styles.helper, { color: t.subtle }]}>
          kcal/day. Bypasses the occupation+steps formula when locked.
        </Text>
      </Section>

      {/* Per-macro locks */}
      <Section title="Macro target locks">
        {MACROS.map((m) => (
          <LockRow
            key={m.key}
            label={m.label}
            color={t[m.color]}
            value={state.macrosLocked[m.key]}
            onChange={(v) =>
              setState((s) => ({
                ...s,
                macrosLocked: { ...s.macrosLocked, [m.key]: v },
              }))
            }
          />
        ))}
        <Text style={[styles.helper, { color: t.subtle }]}>
          When locked, "Apply suggested" on the Macros page skips that field and keeps your
          manual value.
        </Text>
      </Section>

      <View style={styles.actions}>
        <Pressable
          onPress={handleReset}
          style={[styles.secondaryBtn, { backgroundColor: t.surface2 }]}>
          <Text style={[styles.secondaryLabel, { color: t.danger }]}>Clear all</Text>
        </Pressable>
        <Pressable
          onPress={handleSave}
          disabled={saving}
          style={[styles.primaryBtn, { backgroundColor: t.accent, opacity: saving ? 0.85 : 1 }]}>
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryLabel}>Save overrides</Text>
          )}
        </Pressable>
      </View>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const t = useTokens();
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: t.muted }]}>{title}</Text>
      {children}
    </View>
  );
}

function LockRow({
  label,
  value,
  onChange,
  color,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  color?: string;
}) {
  const t = useTokens();
  return (
    <View style={[styles.lockRow, { backgroundColor: t.surface2, borderColor: t.border }]}>
      <Text style={[styles.lockLabel, { color: color ?? t.text }]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: t.surface2, true: t.accent }}
        thumbColor="#fff"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 60, gap: 18 },

  explainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
  },
  explainerText: { flex: 1, fontSize: 12, lineHeight: 17 },

  section: { gap: 8 },
  sectionTitle: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },

  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    textAlign: 'center',
    width: 140,
  },
  helper: { fontSize: 11 },

  lockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  lockLabel: { fontSize: 14, fontWeight: '600' },

  actions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  secondaryBtn: {
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  secondaryLabel: { fontSize: 14, fontWeight: '700' },
  primaryBtn: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryLabel: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
