import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { useChatSession, type Surface } from '../../lib/useChatSession';
import { useHaptics } from '../../lib/useHaptics';
import { useTokens } from '../../lib/theme';

interface Props {
  /** Which surface we're docked over — forwarded to chat.open so the
   *  system prompt can surface the relevant container names. */
  surface: Surface;
}

/** Inline "Ask anything" dock. Rendered as a sibling row above the bottom
 *  tab bar inside (tabs)/_layout, so it lives in the normal layout flow
 *  (no absolute positioning, no floating pill). Uses a keyboardWill/Did
 *  listener to track keyboard visibility — when the on-screen keyboard
 *  opens, the (tabs) layout wrapper translates upward with it via the
 *  KeyboardAvoidingView in _layout, so this row rises above the keyboard
 *  automatically. When an input ELSEWHERE on the page opens a keyboard
 *  the dock is still lifted because it's below Tabs in the same layout
 *  container that KeyboardAvoidingView adjusts. */
export function ChatDock({ surface }: Props) {
  const t = useTokens();
  const chat = useChatSession();
  const haptics = useHaptics();

  // Tracked only for accessibility announcements; layout lift comes
  // from the KeyboardAvoidingView wrapper, not this component.
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const sub1 = Keyboard.addListener(showEvt, () => setKeyboardOpen(true));
    const sub2 = Keyboard.addListener(hideEvt, () => setKeyboardOpen(false));
    return () => { sub1.remove(); sub2.remove(); };
  }, []);

  if (chat.visible) return null;

  const openChat = () => {
    haptics.fire('tap');
    chat.open(surface);
  };

  return (
    <View
      style={[
        styles.wrap,
        {
          backgroundColor: t.bg,
          borderTopColor: t.border,
        },
      ]}>
      <Pressable
        onPress={openChat}
        accessibilityRole="button"
        accessibilityLabel={keyboardOpen ? 'Open chat (keyboard is open)' : 'Open chat'}
        accessibilityHint="Opens the assistant"
        style={styles.iconBtn}>
        <Ionicons name="chatbubble-ellipses-outline" size={16} color={t.muted} />
      </Pressable>
      <Pressable
        style={styles.fakeInput}
        onPress={openChat}
        accessibilityLabel="Open chat to type">
        {chat.draftText ? (
          <Text style={[styles.draftText, { color: t.text }]} numberOfLines={1}>
            {chat.draftText}
          </Text>
        ) : (
          <Text style={[styles.placeholder, { color: t.subtle }]} numberOfLines={1}>
            Ask anything
          </Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    // Hairline top so it reads as a continuous strip with the tab bar
    // below, not a floating pill.
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  iconBtn: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fakeInput: {
    flex: 1,
    paddingVertical: 4,
  },
  draftText: { fontSize: 14, fontWeight: '500' },
  placeholder: { fontSize: 14 },
});
