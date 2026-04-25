import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import type { TxnCategory } from '../../../shared/src/types/finance';
import { SPEND_CATEGORIES } from '../../../shared/src/types/finance';
import { Button, SegmentedControl } from '../../components/ui';
import { createTransaction } from '../../lib/hooks/useFinance';
import { useTokens } from '../../lib/theme';

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

type TxnKind = 'expense' | 'income';

export default function TransactionNewScreen() {
  const t = useTokens();
  const router = useRouter();
  const [kind, setKind] = useState<TxnKind>('expense');
  const [amount, setAmount] = useState('');
  const [merchant, setMerchant] = useState('');
  const [category, setCategory] = useState<TxnCategory>('other');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const canSave = amount.length > 0 && parseFloat(amount) > 0;

  const onSave = async () => {
    const raw = parseFloat(amount);
    if (!raw || raw <= 0) {
      Alert.alert('Amount required', 'Enter a positive amount.');
      return;
    }
    // sign convention: positive = expense, negative = income
    const signed = kind === 'income' ? -raw : raw;
    const cat: TxnCategory = kind === 'income' ? 'income' : category;
    setSaving(true);
    try {
      await createTransaction({
        amount: signed,
        txn_date: date,
        merchant_name: merchant.trim() || undefined,
        category: cat,
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
      <Stack.Screen options={{ title: 'Log transaction' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <SegmentedControl<TxnKind>
          value={kind}
          onChange={setKind}
          options={[
            { value: 'expense', label: 'Expense' },
            { value: 'income', label: 'Income' },
          ]}
        />

        <Label text="Amount" />
        <TextInput
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="0.00"
          placeholderTextColor={t.subtle}
          style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.surface }]}
        />

        <Label text="Merchant / description" />
        <TextInput
          value={merchant}
          onChangeText={setMerchant}
          placeholder="e.g. Trader Joe's, rent, Uber"
          placeholderTextColor={t.subtle}
          style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.surface }]}
        />

        {kind === 'expense' ? (
          <>
            <Label text="Category" />
            <View style={styles.catGrid}>
              {SPEND_CATEGORIES.map((c) => {
                const active = category === c;
                return (
                  <Pressable
                    key={c}
                    onPress={() => setCategory(c)}
                    style={[
                      styles.catChip,
                      {
                        backgroundColor: active ? t.accent : t.surface,
                        borderColor: active ? t.accent : t.border,
                      },
                    ]}>
                    <Text style={[styles.catChipText, { color: active ? '#fff' : t.text }]}>
                      {CATEGORY_LABELS[c]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}

        <Label text="Date (YYYY-MM-DD)" />
        <TextInput
          value={date}
          onChangeText={setDate}
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.surface }]}
        />

        <Label text="Note (optional)" />
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="anything else worth remembering"
          placeholderTextColor={t.subtle}
          style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.surface }]}
        />

        <Button
          title={saving ? 'Saving…' : 'Save'}
          onPress={onSave}
          disabled={!canSave || saving}
          style={{ marginTop: 20 }}
        />
      </ScrollView>
    </View>
  );
}

function Label({ text }: { text: string }) {
  const t = useTokens();
  return <Text style={[styles.label, { color: t.muted }]}>{text}</Text>;
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 48, gap: 6 },
  label: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 10 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  catChip: { borderWidth: 1, borderRadius: 100, paddingVertical: 6, paddingHorizontal: 12 },
  catChipText: { fontSize: 12, fontWeight: '600' },
});
