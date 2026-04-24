import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Keyboard, Platform, Pressable, StyleSheet, View } from 'react-native';
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
/** Gap between the top of the tab bar and the bottom of the FAB at rest. */
const FAB_GAP_ABOVE_TAB_BAR = 7;
const TAB_BAR_HEIGHT = 64;
/** Must mirror ChatOverlay's INPUT_CLEAR_ABOVE_KB so the FAB lifts by
 *  the exact same amount the text input box rises when the keyboard
 *  opens (founder: "move up exactly the same amount as the text input
 *  box"). */
const INPUT_CLEAR_ABOVE_KB = 50;

/** FAB + chat toggle. At rest: bottom-right above the tab bar. When the
 *  chat input is expanded AND the keyboard is open, the FAB rises by
 *  the same delta as the input so the two stay at the same vertical
 *  band. */
export function FAB({ from = 'home' }: Props) {
  const t = useTokens();
  const chat = useChatSession();
  const haptics = useHaptics();
  const insets = useSafeAreaInsets();
  const anim = useRef(new Animated.Value(0)).current;
  const containerRef = useRef<View>(null);
  const [kbHeight, setKbHeight] = useState(0);

  // Track the keyboard so we can lift in step with the input pill.
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const s1 = Keyboard.addListener(showEvt, (e) => setKbHeight(e.endCoordinates?.height ?? 0));
    const s2 = Keyboard.addListener(hideEvt, () => setKbHeight(0));
    return () => { s1.remove(); s2.remove(); };
  }, []);

  useEffect(() => {
    Animated.timing(anim, {
      toValue: chat.visible ? 1 : 0,
      duration: 180,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [chat.visible, anim]);

  // Report the FAB's measured window position.
  const measure = () => {
    const node = containerRef.current;
    if (!node) return;
    node.measureInWindow((x, y, width) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      chat.setFabAnchor({ x, y, size: width || FAB_SIZE });
    });
  };

  // Clear anchor when this FAB unmounts (tab change).
  useEffect(() => {
    return () => chat.setFabAnchor(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rotate = anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] });

  // Resting position OR input-aligned when keyboard is open during an
  // expanded chat. Keeping FAB bottom = input bottom (kbHeight +
  // INPUT_CLEAR_ABOVE_KB) makes them move up the same amount.
  const fabBottom =
    chat.inputExpanded && kbHeight > 0
      ? kbHeight + INPUT_CLEAR_ABOVE_KB
      : TAB_BAR_HEIGHT + insets.bottom + FAB_GAP_ABOVE_TAB_BAR;

  // Re-measure when position changes (keyboard open/close).
  useEffect(() => {
    const id = setTimeout(measure, 50);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fabBottom]);

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
