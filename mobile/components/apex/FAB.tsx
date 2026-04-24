import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet } from 'react-native';

import { useChatSession, type Surface } from '../../lib/useChatSession';
import { useHaptics } from '../../lib/useHaptics';
import { useTokens } from '../../lib/theme';

interface Props {
  /** Which surface the FAB was invoked from — drives the shortcut rail. */
  from?: Surface;
}

/** FAB → ChatOverlay launcher. Per PRD §4.7.4, tapping the + spawns the
 *  chat overlay with per-surface shortcut buttons rendered inside. When
 *  the overlay is visible, this FAB fades out (the overlay's own close
 *  button becomes the X) so there's one "active" button, not two. */
export function FAB({ from = 'home' }: Props) {
  const t = useTokens();
  const chat = useChatSession();
  const haptics = useHaptics();
  const anim = useRef(new Animated.Value(1)).current;

  // Fade the FAB when the overlay is open — the overlay's X is the new
  // "close" button and having both visible is confusing.
  useEffect(() => {
    Animated.timing(anim, {
      toValue: chat.visible ? 0 : 1,
      duration: 160,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [chat.visible, anim]);

  const BOTTOM = 14;

  if (chat.visible) {
    // Short-circuit render so the FAB isn't covering the close button
    // even invisibly (touchable area).
    return null;
  }

  return (
    <Animated.View
      style={[
        styles.fab,
        {
          backgroundColor: t.accent,
          bottom: BOTTOM,
          opacity: anim,
          shadowColor: '#000',
        },
      ]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open chatbot"
        onPress={() => {
          haptics.fire('tap');
          chat.open(from);
        }}
        style={({ pressed }) => [
          styles.fabInner,
          { transform: [{ scale: pressed ? 0.92 : 1 }] },
        ]}>
        <Ionicons name="add" size={30} color="#fff" />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 18,
    width: 52,
    height: 52,
    borderRadius: 26,
    zIndex: 110,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 6,
  },
  fabInner: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
