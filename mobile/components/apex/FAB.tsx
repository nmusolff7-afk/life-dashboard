import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useChatSession, type Surface } from '../../lib/useChatSession';
import { useHaptics } from '../../lib/useHaptics';
import { useTokens } from '../../lib/theme';

interface Props {
  /** Which surface the FAB was invoked from — drives the shortcut rail. */
  from?: Surface;
}

const FAB_SIZE = 52;
const FAB_RIGHT = 18;
/** Gap between the top of the tab bar and the bottom of the FAB when
 *  the chat is closed (resting position). */
const FAB_GAP_ABOVE_TAB_BAR = 12;
const TAB_BAR_HEIGHT = 64;
/** When chat is OPEN, FAB migrates to the top-right of the screen /
 *  top of the conversation card. Offset from the status-bar safe-area. */
const FAB_TOP_GAP = 8;

/** FAB + chat toggle.
 *
 *   Chat closed (resting): bottom-right, above the tab bar. + icon.
 *   Chat open: top-right, aligned with the top of the conversation
 *              card / status-bar safe area. × icon (rotated 45°).
 *
 *  The migration is a layout jump (no animation yet) — the dim
 *  backdrop appearing simultaneously masks the jump visually. If we
 *  want a smoother translation later, wrap the position in Animated.
 */
export function FAB({ from = 'home' }: Props) {
  const t = useTokens();
  const chat = useChatSession();
  const haptics = useHaptics();
  const insets = useSafeAreaInsets();
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

  // Report the FAB's measured window position. Legacy — some pieces of
  // ChatOverlay anchoring still read it as a fallback.
  const measure = () => {
    const node = containerRef.current;
    if (!node) return;
    node.measureInWindow((x, y, width) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      chat.setFabAnchor({ x, y, size: width || FAB_SIZE });
    });
  };

  // Clear anchor when this FAB unmounts (tab change) so a stale position
  // doesn't leak.
  useEffect(() => {
    return () => chat.setFabAnchor(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-measure whenever chat.visible flips (FAB moves top-right vs
  // bottom-right). onLayout doesn't always fire for pure position
  // changes on absolute-positioned children.
  useEffect(() => {
    const id = setTimeout(measure, 60);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.visible]);

  const rotate = anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] });

  // Position switches based on chat.visible.
  const positionStyle = chat.visible
    ? { top: insets.top + FAB_TOP_GAP, right: FAB_RIGHT }
    : { bottom: TAB_BAR_HEIGHT + insets.bottom + FAB_GAP_ABOVE_TAB_BAR, right: FAB_RIGHT };

  return (
    <View
      ref={containerRef}
      onLayout={measure}
      collapsable={false}
      style={[styles.fab, positionStyle]}
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
    width: FAB_SIZE,
    height: FAB_SIZE,
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
