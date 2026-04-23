import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { useTokens } from '../../lib/theme';

interface Props {
  label: string;
  value: string; // already formatted — consumer controls units and precision
  /** Override value color. Default is muted when value === '—', text otherwise. */
  valueColor?: string;
  onPress?: () => void;
  style?: ViewStyle;
}

/** Mirrors Flask .dash-stat-card: centered value above uppercase label, tap-scales. */
export function StatCard({ label, value, valueColor, onPress, style }: Props) {
  const t = useTokens();
  const isEmpty = value === '—' || value === '';
  const resolvedColor = valueColor ?? (isEmpty ? t.muted : t.text);
  const Container: React.ElementType = onPress ? Pressable : View;

  return (
    <Container
      onPress={onPress}
      style={[
        styles.card,
        {
          backgroundColor: t.surface,
          shadowColor: '#000',
        },
        style,
      ]}>
      <Text style={[styles.value, { color: resolvedColor }]}>{value}</Text>
      <Text style={[styles.label, { color: t.muted }]}>{label}</Text>
    </Container>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 3,
  },
  value: { fontSize: 24, fontWeight: '700', lineHeight: 28, marginBottom: 4, letterSpacing: -0.2 },
  label: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 },
});
