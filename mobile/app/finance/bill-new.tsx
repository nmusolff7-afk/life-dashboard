import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import type { BillFrequency } from '../../../shared/src/types/finance';
import { Button, SegmentedControl } from '../../components/ui';
import { createBill } from '../../lib/hooks/useFinance';
import { useTokens } from '../../lib/theme';

export default function BillNewScreen() {
  const t = useTokens();
  const router = useRouter();
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  });
  const [frequency, setFrequency] = useState<BillFrequency>('monthly');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const canSave = name.trim().length > 0 && dueDate.length === 10;

  const onSave = async () => {
    setSaving(true);
    try {
      await createBill({
        name: name.trim(),
        amount: amount ? parseFloat(amount) : undefined,
        due_date: dueDate,
        frequency,
        note: note.trim() || undefined,
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
      <Stack.Screen options={{ title: 'Add bill' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.label, { color: t.muted }]}>Name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. Rent, Netflix, electric"
          placeholderTextColor={t.subtle}
          style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.surface }]}
        />

        <Text style={[styles.label, { color: t.muted }]}>Amount (optional)</Text>
        <TextInput
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="0.00"
          placeholderTextColor={t.subtle}
          style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.surface }]}
        />

        <Text style={[styles.label, { color: t.muted }]}>Next due date (YYYY-MM-DD)</Text>
        <TextInput
          value={dueDate}
          onChangeText={setDueDate}
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.surface }]}
        />

        <Text style={[styles.label, { color: t.muted }]}>Frequency</Text>
        <SegmentedControl<BillFrequency>
          value={frequency}
          onChange={setFrequency}
          options={[
            { value: 'monthly', label: 'Monthly' },
            { value: 'weekly', label: 'Weekly' },
            { value: 'biweekly', label: 'Bi-weekly' },
            { value: 'yearly', label: 'Yearly' },
            { value: 'once', label: 'One-time' },
          ]}
        />

        <Text style={[styles.label, { color: t.muted }]}>Note (optional)</Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.surface }]}
        />

        <Text style={[styles.footerNote, { color: t.subtle }]}>
          Marking a recurring bill as paid automatically advances the due date to the next occurrence.
        </Text>

        <Button
          title={saving ? 'Saving…' : 'Save bill'}
          onPress={onSave}
          disabled={!canSave || saving}
          style={{ marginTop: 20 }}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 48, gap: 6 },
  label: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 12 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  footerNote: { fontSize: 11, lineHeight: 15, marginTop: 12, fontStyle: 'italic' },
});
