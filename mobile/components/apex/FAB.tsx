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
/** Gap between the top of the tab bar and the bottom of the FAB (when
 *  chat is closed / not expanded). */
const FAB_GAP_ABOVE_TAB_BAR = 12;
const TAB_BAR_HEIGHT = 64;
/** When chat is expanded, FAB rises and floats above the input pill on
 *  the right-hand side. Gap between the input's top edge and the FAB's
 *  bottom edge. */
const FAB_GAP_ABOVE_INPUT = 8;
/** Matches ChatOverlay's INPUT_PILL_HEIGHT + clearance so the FAB's
 *  rising math stays in lock-step with the input. */
const INPUT_PILL_HEIGHT = 50;
const INPUT_CLEAR_ABOVE_KB = 20;

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
  const insets = useSafeAreaInsets();
  const anim = useRef(new Animated.Value(0)).current;
  const containerRef = useRef<View>(null);
  const [kbHeight, setKbHeight] = useState(0);

  // Track the keyboard so the FAB can rise with the chat input when
  // expanded. ChatOverlay has its own listener for positioning its
  // pieces; having the FAB own a copy keeps the two in lock-step
  // without a shared ref.
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const s1 = Keyboard.addListener(showEvt, (e) => setKbHeight(e.endCoordinates?.height ?? 0));
    const s2 = Keyboard.addListener(hideEvt, () => setKbHeight(0));
    return () => { s1.remove(); s2.remove(); };
  }, []);

  // Two positioning modes:
  //   1. Expanded chat: FAB floats just above the input pill on the
  //      right side. Input's bottom = kbHeight + clearance OR
  //      insets.bottom + 16 (keyboard closed). FAB bottom =
  //      input-top + gap = inputBottom + pillHeight + gap.
  //   2. Otherwise: resting position above the tab bar.
  const fabBottom = chat.inputExpanded
    ? (kbHeight > 0
        ? kbHeight + INPUT_CLEAR_ABOVE_KB + INPUT_PILL_HEIGHT + FAB_GAP_ABOVE_INPUT
        : insets.bottom + 16 + INPUT_PILL_HEIGHT + FAB_GAP_ABOVE_INPUT)
    : TAB_BAR_HEIGHT + insets.bottom + FAB_GAP_ABOVE_TAB_BAR;

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

  // Re-measure whenever the FAB's bottom offset changes (expand/keyboard).
  // onLayout doesn't always fire for pure `bottom` changes on absolute
  // children, so we force a measurement pass.
  useEffect(() => {
    const id = setTimeout(measure, 50);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fabBottom]);

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
      style={[styles.fab, { bottom: fabBottom }]}
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
