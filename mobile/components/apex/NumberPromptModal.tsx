import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useTokens } from '../../lib/theme';

interface Props {
  visible: boolean;
  title: string;
  unit?: string;
  /** Prefilled value when the modal opens. */
  initial?: number | null;
  placeholder?: string;
  onClose: () => void;
  /** Saver. Modal stays open during the promise; errors surface via throw. */
  onSave: (value: number) => Promise<void>;
}

/** Dead-simple "type a number, save it" sheet used for weight + steps logging. */
export function NumberPromptModal({
  visible,
  title,
  unit,
  initial,
  placeholder,
  onClose,
  onSave,
}: Props) {
  const t = useTokens();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setText(initial != null ? String(Math.round(initial)) : '');
      setError(null);
    }
  }, [visible, initial]);

  const handleSave = async () => {
    const n = parseFloat(text);
    if (!Number.isFinite(n) || n < 0) {
      setError('Enter a valid positive number.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave(n);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <Pressable onPress={onClose} style={styles.backdrop}>
        <Pressable onPress={() => {}} style={[styles.card, { backgroundColor: t.surface }]}>
          <Text style={[styles.title, { color: t.text }]}>{title}</Text>
          <View style={styles.inputRow}>
            <TextInput
              value={text}
              onChangeText={setText}
              keyboardType="decimal-pad"
              placeholder={placeholder}
              placeholderTextColor={t.subtle}
              autoFocus
              style={[styles.input, { color: t.text, backgroundColor: t.surface2, borderColor: t.border }]}
            />
            {unit ? <Text style={[styles.unit, { color: t.muted }]}>{unit}</Text> : null}
          </View>
          {error ? <Text style={[styles.error, { color: t.danger }]}>{error}</Text> : null}
          <View style={styles.btns}>
            <Pressable
              onPress={onClose}
              style={[styles.btn, { backgroundColor: t.surface2 }]}
              disabled={busy}>
              <Text style={[styles.btnLabel, { color: t.text }]}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              style={[styles.btn, { backgroundColor: t.accent, opacity: busy ? 0.8 : 1 }]}
              disabled={busy}>
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={[styles.btnLabel, { color: '#fff' }]}>Save</Text>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: { width: '100%', maxWidth: 340, borderRadius: 20, padding: 20, gap: 12 },
  title: { fontSize: 16, fontWeight: '700' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
  },
  unit: { fontSize: 14, fontWeight: '500', minWidth: 36 },
  error: { fontSize: 12, marginTop: -4 },
  btns: { flexDirection: 'row', gap: 10, marginTop: 4 },
  btn: { flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  btnLabel: { fontSize: 14, fontWeight: '700' },
});
