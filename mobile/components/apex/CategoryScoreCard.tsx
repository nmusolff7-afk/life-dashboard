import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTokens } from '../../lib/theme';

interface Props {
  label: string;
  color: string;
  score?: number | null; // null / undefined = empty
  hint?: string;
  onPress: () => void;
}

export function CategoryScoreCard({ label, color, score, hint, onPress }: Props) {
  const t = useTokens();
  const display = score == null ? '—' : String(Math.round(score));
  const defaultHint = 'Scoring activates once you have enough data';

  return (
    <Pressable
      onPress={onPress}
      style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
      <Text style={[styles.label, { color }]}>{label}</Text>
      <Text style={[styles.score, { color: score == null ? t.subtle : t.text }]}>{display}</Text>
      <Text style={[styles.hint, { color: t.subtle }]}>{hint ?? defaultHint}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexBasis: '48%', flexGrow: 1, borderWidth: 1, borderRadius: 20, padding: 18, gap: 4 },
  label: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  score: { fontSize: 32, fontWeight: '700' },
  hint: { fontSize: 11, marginTop: 4 },
});
