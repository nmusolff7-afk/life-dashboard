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
   *  accent border per §4.7.5 time-of-day emphasis. Deterministic. */
  emphasized?: boolean;
}

interface Props {
  shortcuts: Shortcut[];
}

/** Vertical rail of 2–5 shortcut pills. Rendered above the X (close) button
 *  in the chat overlay per PRD §4.7.4. Hidden once a conversation has
 *  content (the ChatOverlay parent manages that). */
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
              transform: [{ scale: pressed ? 0.97 : 1 }],
              opacity: pressed ? 0.88 : 1,
            },
          ]}>
          <Ionicons name={s.icon} size={16} color={t.text} />
          <Text style={[styles.label, { color: t.text }]}>{s.label}</Text>
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 100,
    // Parent ChatOverlay gives this column a fixed width so every pill
    // in the stack is the same size — matches the founder's spec.
    alignSelf: 'stretch',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
});
