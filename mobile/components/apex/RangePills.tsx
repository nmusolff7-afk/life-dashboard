import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTokens } from '../../lib/theme';

export type Range = 7 | 30 | 90;

interface Props {
  value: Range;
  onChange: (r: Range) => void;
}

const RANGES: { value: Range; label: string }[] = [
  { value: 7, label: '7D' },
  { value: 30, label: '30D' },
  { value: 90, label: '90D' },
];

/** Pill segmented control for chart ranges, matches Flask's chart range picker. */
export function RangePills({ value, onChange }: Props) {
  const t = useTokens();
  return (
    <View style={[styles.wrap, { backgroundColor: t.surface2 }]}>
      {RANGES.map((r) => {
        const active = value === r.value;
        return (
          <Pressable
            key={r.value}
            onPress={() => onChange(r.value)}
            style={[styles.pill, active && { backgroundColor: t.accent }]}>
            <Text
              style={[
                styles.label,
                { color: active ? '#fff' : t.muted, fontWeight: active ? '700' : '500' },
              ]}>
              {r.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    borderRadius: 100,
    padding: 3,
    alignSelf: 'flex-start',
  },
  pill: {
    borderRadius: 100,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  label: { fontSize: 11 },
});
