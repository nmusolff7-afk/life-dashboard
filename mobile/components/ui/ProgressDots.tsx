import { StyleSheet, Text, View } from 'react-native';

import { useTokens } from '../../lib/theme';

interface Props {
  current: number; // 1-indexed
  total: number;
  label?: string;
}

export function ProgressDots({ current, total, label }: Props) {
  const t = useTokens();
  return (
    <View style={styles.wrap}>
      {label ? <Text style={[styles.label, { color: t.muted }]}>{label}</Text> : null}
      <View style={styles.dots}>
        {Array.from({ length: total }).map((_, i) => {
          const done = i < current;
          return (
            <View
              key={i}
              style={[
                styles.dot,
                { backgroundColor: done ? t.accent : t.surface, borderColor: t.border },
              ]}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6, alignItems: 'center' },
  label: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: '600' },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 28, height: 4, borderRadius: 2, borderWidth: 1 },
});
