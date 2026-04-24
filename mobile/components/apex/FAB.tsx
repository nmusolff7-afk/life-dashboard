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

/** FAB stays in place; tap rotates the `+` 45° into an `×` over 180ms.
 *  Per PRD §4.7.4 the button itself is the toggle — when the overlay is
 *  open, tapping the rotated FAB closes. The ChatOverlay renders its
 *  shortcut rail + chat input AROUND this button without its own close
 *  control.
 */
export function FAB({ from = 'home' }: Props) {
  const t = useTokens();
  const chat = useChatSession();
  const haptics = useHaptics();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: chat.visible ? 1 : 0,
      duration: 180,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [chat.visible, anim]);

  const rotate = anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] });
  const BOTTOM = 14;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={chat.visible ? 'Close chat' : 'Open chat'}
      onPress={() => {
        haptics.fire('tap');
        if (chat.visible) chat.close();
        else chat.open(from);
      }}
      style={({ pressed }) => [
        styles.fab,
        {
          backgroundColor: t.accent,
          bottom: BOTTOM,
          transform: [{ scale: pressed ? 0.92 : 1 }],
          shadowColor: '#000',
        },
      ]}>
      <Animated.View style={{ transform: [{ rotate }] }}>
        <Ionicons name="add" size={30} color="#fff" />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 18,
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 200,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 6,
  },
});
