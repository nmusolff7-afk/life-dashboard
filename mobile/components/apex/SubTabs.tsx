import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useHaptics } from '../../lib/useHaptics';
import { useTokens } from '../../lib/theme';

interface Props<T extends string> {
  tabs: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  /** Compact mode — smaller type + tighter spacing for inline rendering
   *  in the TabHeader `right` slot. Default: standalone strip. */
  compact?: boolean;
}

/** Inline segmented control for category sub-tabs (Today / Progress /
 *  History). Renders as a standalone strip by default; pass compact
 *  to shrink for nesting inside TabHeader. */
export function SubTabs<T extends string>({ tabs, value, onChange, compact }: Props<T>) {
  const t = useTokens();
  const haptics = useHaptics();
  return (
    <View
      style={[
        compact ? styles.wrapCompact : styles.wrap,
        compact ? null : { borderBottomColor: t.border },
      ]}>
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <Pressable
            key={tab.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={tab.label}
            onPress={() => {
              if (!active) haptics.fire('tap');
              onChange(tab.value);
            }}
            style={({ pressed }) => [
              compact ? styles.tabCompact : styles.tab,
              { transform: [{ scale: pressed ? 0.96 : 1 }] },
            ]}>
            <Text
              style={[
                compact ? styles.labelCompact : styles.label,
                { color: active ? t.accent : t.muted, fontWeight: active ? '700' : '500' },
              ]}>
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

  wrapCompact: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  tabCompact: { paddingVertical: 6 },
  labelCompact: { fontSize: 13 },
});
