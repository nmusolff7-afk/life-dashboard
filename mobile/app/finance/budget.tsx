import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import type { TxnCategory } from '../../../shared/src/types/finance';
import { SPEND_CATEGORIES } from '../../../shared/src/types/finance';
import { Button, SegmentedControl } from '../../components/ui';
import { apiFetch } from '../../lib/api';
import { setBudget } from '../../lib/hooks/useFinance';
import { useTokens } from '../../lib/theme';

type Mode = 'simple' | 'category';

const CATEGORY_LABELS: Record<TxnCategory, string> = {
  groceries: 'Groceries',
  dining: 'Dining',
  transport: 'Transport',
  entertainment: 'Entertainment',
  shopping: 'Shopping',
  bills: 'Bills',
  health: 'Health',
  travel: 'Travel',
  other: 'Other',
  income: 'Income',
  transfer: 'Transfer',
};

export default function BudgetScreen() {
  const t = useTokens();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('simple');
  const [total, setTotal] = useState('');
  const [perCat, setPerCat] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load existing budgets so edits pre-fill with current values.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await apiFetch('/api/finance/budget');
        const json = await res.json();
        if (cancelled) return;
        const budgets = (json.budgets ?? {}) as Record<string, number>;
        if (budgets.total != null) {
          setMode('simple');
          setTotal(String(budgets.total));
        } else if (Object.keys(budgets).length > 0) {
          setMode('category');
          const entries: Record<string, string> = {};
          for (const [k, v] of Object.entries(budgets)) entries[k] = String(v);
          setPerCat(entries);
        }
      } catch { /* default to empty */ }
      finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  const onSave = async () => {
    setSaving(true);
    try {
      if (mode === 'simple') {
        const cap = parseFloat(total);
        if (!cap || cap < 0) {
          Alert.alert('Invalid', 'Enter a positive monthly total.');
          setSaving(false);
          return;
        }
        await setBudget('total', cap);
      } else {
        const updates = Object.entries(perCat)
          .map(([cat, v]) => [cat, parseFloat(v)] as const)
          .filter(([, v]) => v > 0);
        if (updates.length === 0) {
          Alert.alert('Nothing set', 'Enter at least one category cap.');
          setSaving(false);
          return;
        }
        for (const [cat, cap] of updates) {
          await setBudget(cat, cap);
        }
      }
      router.back();
    } catch (e) {
      Alert.alert('Could not save', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: t.bg }]}>
        <ActivityIndicator color={t.accent} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen options={{ title: 'Set budget' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.intro, { color: t.muted }]}>
          Simple mode caps your total monthly spending. Category mode lets you cap individual categories (groceries, dining, etc.) — totals from active categories add up.
        </Text>
        <SegmentedControl<Mode>
          value={mode}
          onChange={setMode}
          options={[
            { value: 'simple', label: 'Simple' },
            { value: 'category', label: 'Category' },
          ]}
        />

        {mode === 'simple' ? (
          <>
            <Text style={[styles.label, { color: t.muted }]}>Monthly total cap ($)</Text>
            <TextInput
              value={total}
              onChangeText={setTotal}
              keyboardType="decimal-pad"
              placeholder="e.g. 3000"
              placeholderTextColor={t.subtle}
              style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.surface }]}
            />
          </>
        ) : (
          <>
            <Text style={[styles.label, { color: t.muted }]}>Per-category monthly caps ($)</Text>
            {SPEND_CATEGORIES.map((cat) => (
              <View key={cat} style={[styles.catRow, { backgroundColor: t.surface, borderColor: t.border }]}>
                <Text style={[styles.catName, { color: t.text }]}>{CATEGORY_LABELS[cat]}</Text>
                <TextInput
                  value={perCat[cat] ?? ''}
                  onChangeText={(v) => setPerCat({ ...perCat, [cat]: v })}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={t.subtle}
                  style={[styles.catInput, { color: t.text, borderColor: t.border }]}
                />
              </View>
            ))}
          </>
        )}

        <Text style={[styles.footerNote, { color: t.subtle }]}>
          Changing modes doesn't delete existing caps — a future cycle will add individual-category delete. Leave a category blank or at 0 to skip it for now.
        </Text>

        <Button
          title={saving ? 'Saving…' : 'Save budget'}
          onPress={onSave}
          disabled={saving}
          style={{ marginTop: 20 }}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 48, gap: 10 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  intro: { fontSize: 13, lineHeight: 18, fontStyle: 'italic' },
  label: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 12 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 18, fontWeight: '700' },
  catRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12,
  },
  catName: { flex: 1, fontSize: 14, fontWeight: '600' },
  catInput: { borderWidth: 1, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, minWidth: 90, textAlign: 'right', fontSize: 14 },
  footerNote: { fontSize: 11, lineHeight: 15, marginTop: 14, fontStyle: 'italic' },
});
