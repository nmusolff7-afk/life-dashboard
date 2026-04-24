import { StyleSheet, Text, View } from 'react-native';

import { useTokens } from '../../lib/theme';

interface Props {
  title: string;
}

/** Compact per-tab header strip beneath the global ScreenHeader. Clean
 *  text, no subtext per locked D3. Used on every top-level tab so the
 *  user always knows which surface they're on. */
export function TabHeader({ title }: Props) {
  const t = useTokens();
  return (
    <View style={[styles.wrap, { backgroundColor: t.bg, borderBottomColor: t.border }]}>
      <Text style={[styles.title, { color: t.text }]}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.3,
    lineHeight: 32,
  },
});
