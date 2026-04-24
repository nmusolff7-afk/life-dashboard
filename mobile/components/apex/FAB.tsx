import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';

import { useChatSession, type Surface } from '../../lib/useChatSession';
import { useHaptics } from '../../lib/useHaptics';
import { useTokens } from '../../lib/theme';

interface Props {
  /** Which surface the FAB was invoked from — drives the shortcut rail. */
  from?: Surface;
}

const FAB_SIZE = 52;
const FAB_BOTTOM = 14;
const FAB_RIGHT = 18;

/** FAB stays in place; tap rotates the `+` 45° into an `×` over 180ms.
 *  Per PRD §4.7.4 the button itself is the toggle — when the overlay is
 *  open, tapping the rotated FAB closes. The ChatOverlay renders its
 *  shortcut rail + chat input AROUND this button without its own close
 *  control.
 *
 *  The FAB also reports its measured on-screen position to the chat
 *  context via setFabAnchor, so ChatOverlay can tether the shortcut
 *  rail / chat input precisely to it across screen sizes and safe-area
 *  insets. We measureInWindow after layout rather than trusting the
 *  hardcoded bottom/right math.
 */
export function FAB({ from = 'home' }: Props) {
  const t = useTokens();
  const chat = useChatSession();
  const haptics = useHaptics();
  const anim = useRef(new Animated.Value(0)).current;
  const containerRef = useRef<View>(null);

  useEffect(() => {
    Animated.timing(anim, {
      toValue: chat.visible ? 1 : 0,
      duration: 180,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [chat.visible, anim]);

  // Report the FAB's measured window position so the chat overlay can
  // anchor its pieces relative to the real button, not assumed insets.
  // Re-measure on every layout pass — covers rotation, keyboard effect,
  // or tab-bar height changes.
  const measure = () => {
    const node = containerRef.current;
    if (!node) return;
    node.measureInWindow((x, y, width) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      chat.setFabAnchor({ x, y, size: width || FAB_SIZE });
    });
  };

  // Clear anchor when this FAB unmounts (tab change) so a stale position
  // doesn't leak. The next tab's FAB remounts and re-reports.
  useEffect(() => {
    return () => chat.setFabAnchor(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rotate = anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] });

  return (
    <View
      ref={containerRef}
      onLayout={measure}
      collapsable={false}
      style={[styles.fab, { bottom: FAB_BOTTOM }]}
      pointerEvents="box-none">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={chat.visible ? 'Close chat' : 'Open chat'}
        onPress={() => {
          haptics.fire('tap');
          if (chat.visible) chat.close();
          else chat.open(from);
        }}
        style={({ pressed }) => [
          styles.button,
          {
            backgroundColor: t.accent,
            transform: [{ scale: pressed ? 0.92 : 1 }],
            shadowColor: '#000',
          },
        ]}>
        <Animated.View style={{ transform: [{ rotate }] }}>
          <Ionicons name="add" size={30} color="#fff" />
        </Animated.View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: FAB_RIGHT,
    width: FAB_SIZE,
    height: FAB_SIZE,
    // zIndex: 200 keeps the button above the dim backdrop the ChatOverlay
    // paints when it opens, so the FAB + its rotation stay fully visible.
    zIndex: 200,
  },
  button: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 6,
  },
});
