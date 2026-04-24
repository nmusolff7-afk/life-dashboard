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
/** Gap between the top of the tab bar and the bottom of the FAB. */
const FAB_GAP_ABOVE_TAB_BAR = 12;
const TAB_BAR_HEIGHT = 64;

/** FAB + chat toggle. Always bottom-right above the tab bar. Tap
 *  rotates + → × to indicate the toggle; the ChatOverlay renders the
 *  shortcut rail + input pill around this fixed position. */
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

  const rotate = anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] });

  const fabBottom = TAB_BAR_HEIGHT + insets.bottom + FAB_GAP_ABOVE_TAB_BAR;

  return (
    <View
      ref={containerRef}
      onLayout={measure}
      collapsable={false}
      style={[styles.fab, { bottom: fabBottom, right: FAB_RIGHT }]}
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
