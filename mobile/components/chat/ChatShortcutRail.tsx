import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useHaptics } from '../../lib/useHaptics';
import { useTokens } from '../../lib/theme';

export interface Shortcut {
  key: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  /** Visual hint — the most-contextually-relevant one gets a thicker
   *  accent border per §4.7.5 time-of-day emphasis. */
  emphasized?: boolean;
}

interface Props {
  shortcuts: Shortcut[];
}

/** Narrow vertical pill stack sized to sit directly above the FAB.
 *  Pills are compact (icon on top, small label below) so the whole
 *  column stays roughly the FAB's width and reads as "a little menu
 *  growing out of the +". Parent anchors the column above the FAB. */
export function ChatShortcutRail({ shortcuts }: Props) {
  const t = useTokens();
  const haptics = useHaptics();
  return (
    <View style={styles.wrap}>
      {shortcuts.map((s) => (
        <Pressable
          key={s.key}
          onPress={() => {
            haptics.fire('tap');
            s.onPress();
          }}
          style={({ pressed }) => [
            styles.pill,
            {
              backgroundColor: t.surface,
              borderColor: s.emphasized ? t.accent : t.border,
              borderWidth: s.emphasized ? 2 : 1,
              transform: [{ scale: pressed ? 0.95 : 1 }],
              opacity: pressed ? 0.88 : 1,
            },
          ]}>
          <Ionicons name={s.icon} size={18} color={t.text} />
          <Text style={[styles.label, { color: t.text }]} numberOfLines={1}>
            {s.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'stretch',
    gap: 8,
  },
  pill: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 14,
    minHeight: 52,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
});
