import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTokens } from '../../lib/theme';

interface Props {
  title: string;
  /** Optional inline content rendered to the right of the title —
   *  typically a SubTabs selector or a Streak bar, following the
   *  founder's "save vertical space" spec. */
  right?: ReactNode;
}

/** Per-tab header strip beneath the global ScreenHeader. Large H1-style
 *  title on the left; optional `right` slot hosts the sub-tab selector
 *  or the streak bar inline. Clean text, no subtext (locked D3). */
export function TabHeader({ title, right }: Props) {
  const t = useTokens();
  return (
    <View style={[styles.wrap, { backgroundColor: t.bg, borderBottomColor: t.border }]}>
      <Text style={[styles.title, { color: t.text }]}>{title}</Text>
      {right ? <View style={styles.rightSlot}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.3,
    lineHeight: 32,
  },
  rightSlot: {
    flex: 1,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
});
