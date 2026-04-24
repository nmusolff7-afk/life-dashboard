import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useHaptics } from '../../lib/useHaptics';
import { useTokens } from '../../lib/theme';

interface Props {
  title: string;
  hint?: string;
  onPress?: () => void;
  right?: React.ReactNode;
  destructive?: boolean;
}

export function SettingsRow({ title, hint, onPress, right, destructive }: Props) {
  const t = useTokens();
  const haptics = useHaptics();
  return (
    <Pressable
      onPress={() => {
        if (!onPress) return;
        haptics.fire('tap');
        onPress();
      }}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: t.surface,
          borderColor: t.border,
          opacity: onPress && pressed ? 0.85 : 1,
        },
      ]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: destructive ? t.danger : t.text }]}>{title}</Text>
        {hint ? <Text style={[styles.hint, { color: t.muted }]}>{hint}</Text> : null}
      </View>
      {right ?? (onPress ? <Text style={[styles.chev, { color: t.subtle }]}>›</Text> : null)}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 14, padding: 14, gap: 12 },
  title: { fontSize: 15, fontWeight: '600' },
  hint: { fontSize: 12, marginTop: 3, lineHeight: 17 },
  chev: { fontSize: 18, fontWeight: '400' },
});
