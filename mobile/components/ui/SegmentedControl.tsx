import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTokens } from '../../lib/theme';

interface Option<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  options: Option<T>[];
  value: T | null;
  onChange: (value: T) => void;
}

export function SegmentedControl<T extends string>({ options, value, onChange }: Props<T>) {
  const t = useTokens();
  return (
    <View style={[styles.wrap, { backgroundColor: t.surface, borderColor: t.border }]}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[styles.seg, selected && { backgroundColor: t.accent }]}
            accessibilityRole="button"
            accessibilityState={{ selected }}>
            <Text style={[styles.text, { color: selected ? '#FFFFFF' : t.muted }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', borderRadius: 14, borderWidth: 1, padding: 2 },
  seg: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 12 },
  text: { fontSize: 14, fontWeight: '600' },
});
