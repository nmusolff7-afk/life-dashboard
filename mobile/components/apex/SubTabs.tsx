import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTokens } from '../../lib/theme';

interface Props<T extends string> {
  tabs: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}

/** Inline segmented control for category sub-tabs (Today / Progress / History). */
export function SubTabs<T extends string>({ tabs, value, onChange }: Props<T>) {
  const t = useTokens();
  return (
    <View style={[styles.wrap, { borderBottomColor: t.border }]}>
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <Pressable key={tab.value} onPress={() => onChange(tab.value)} style={styles.tab}>
            <Text style={[styles.label, { color: active ? t.accent : t.muted, fontWeight: active ? '700' : '500' }]}>
              {tab.label}
            </Text>
            {active ? <View style={[styles.underline, { backgroundColor: t.accent }]} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', borderBottomWidth: 1, paddingHorizontal: 16 },
  tab: { paddingVertical: 12, marginRight: 18, alignItems: 'center' },
  label: { fontSize: 14 },
  underline: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, borderRadius: 1 },
});
