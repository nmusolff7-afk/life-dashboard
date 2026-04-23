import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { useTokens } from '../../lib/theme';

interface Props {
  label: string;
  value: string; // already formatted — consumer controls units and precision
  unit?: string;
  /** Override value color. Default is muted when value === '—', text otherwise. */
  valueColor?: string;
  cta?: { label: string; onPress: () => void };
  onPress?: () => void;
  style?: ViewStyle;
}

export function StatCard({ label, value, unit, valueColor, cta, onPress, style }: Props) {
  const t = useTokens();
  const isEmpty = value === '—' || value === '';
  const resolvedColor = valueColor ?? (isEmpty ? t.muted : t.text);
  const Container: React.ElementType = onPress ? Pressable : View;

  return (
    <Container
      onPress={onPress}
      style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }, style]}>
      <Text style={[styles.label, { color: t.muted }]}>{label}</Text>
      <View style={styles.valueRow}>
        <Text style={[styles.value, { color: resolvedColor }]}>{value}</Text>
        {unit ? <Text style={[styles.unit, { color: t.muted }]}>{unit}</Text> : null}
      </View>
      {cta ? (
        <Pressable onPress={cta.onPress} hitSlop={6}>
          <Text style={[styles.cta, { color: t.accent }]}>{cta.label}</Text>
        </Pressable>
      ) : null}
    </Container>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 4 },
  label: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  value: { fontSize: 24, fontWeight: '700' },
  unit: { fontSize: 12 },
  cta: { fontSize: 11, fontWeight: '600', marginTop: 2 },
});
