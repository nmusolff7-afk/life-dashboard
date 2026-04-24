import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';

import { useChatSession } from '../../lib/useChatSession';
import { useTokens } from '../../lib/theme';
import { ChatBubble, TypingBubble } from './ChatBubble';
import { ChatInput } from './ChatInput';
import { ChatShortcutRail, type Shortcut } from './ChatShortcutRail';
import { shortcutsForSurface } from './surfaceShortcuts';

/** PRD §4.7.4 layout. Founder-locked:
 *  - The FAB stays put and rotates 45° into an `×` — it IS the close
 *    button. This overlay has NO close control of its own.
 *  - Dim backdrop fades in (tap-to-dismiss).
 *  - RIGHT side: vertical shortcut column, fixed width, sitting in the
 *    space above the FAB. All pills same width.
 *  - LEFT side: chat input pill at the bottom-left (immediately left of
 *    the FAB). Conversation bubbles rise up above the input.
 *  - Content fades in-place — no slide/translate. Everything appears
 *    AROUND the FAB without the whole panel dropping.
 *  - When the conversation has turns: shortcut column collapses, chat
 *    area expands to full width.
 */
export function ChatOverlay() {
  const t = useTokens();
  const scheme = useColorScheme();
  const router = useRouter();
  const chat = useChatSession();
  const anim = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<ScrollView>(null);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (chat.visible && dismissed) setDismissed(false);
    Animated.timing(anim, {
      toValue: chat.visible ? 1 : 0,
      duration: 180,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !chat.visible) setDismissed(true);
    });
  }, [chat.visible, anim, dismissed]);

  useEffect(() => {
    if (chat.turns.length > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 40);
    }
  }, [chat.turns.length]);

  if (dismissed) return null;

  const backdropOpacity = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, scheme === 'light' ? 0.3 : 0.5],
  });
  const hasTurns = chat.turns.length > 0;

  const shortcuts: Shortcut[] = shortcutsForSurface(chat.surface, {
    router,
    closeOverlay: chat.close,
  });

  return (
    <View pointerEvents={chat.visible ? 'auto' : 'none'} style={StyleSheet.absoluteFill}>
      {/* Dim backdrop — tap to dismiss */}
      <Animated.View
        pointerEvents={chat.visible ? 'auto' : 'none'}
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: '#000', opacity: backdropOpacity },
        ]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={chat.close} />
      </Animated.View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.kav}
        pointerEvents="box-none">
        {/* Content fades in-place (opacity only). No translateY — the whole
            composition appears around the fixed FAB. */}
        <Animated.View pointerEvents="box-none" style={[styles.panel, { opacity: anim }]}>
          {/* Conversation — when turns exist, renders above the input
              spanning close to full width. */}
          {hasTurns ? (
            <View
              style={[
                styles.conversation,
                { backgroundColor: t.bg + 'EE', borderColor: t.border },
              ]}>
              <View style={styles.conversationHeader}>
                <Text style={[styles.conversationTitle, { color: t.muted }]}>Chat</Text>
                <Pressable onPress={chat.reset} accessibilityRole="button">
                  <Text style={[styles.resetLink, { color: t.accent }]}>Clear</Text>
                </Pressable>
              </View>
              <ScrollView
                ref={scrollRef}
                style={styles.bubbles}
                contentContainerStyle={styles.bubblesContent}
                keyboardShouldPersistTaps="handled">
                {chat.turns.map((turn) => (
                  <ChatBubble key={turn.id} turn={turn} />
                ))}
                {chat.sending ? <TypingBubble /> : null}
              </ScrollView>
            </View>
          ) : null}

          {/* Bottom row — shortcut rail on the right (reserving the FAB's
              column width so shortcuts sit directly above the rotated X);
              chat input on the left (immediately left of the FAB). */}
          <View style={styles.bottomRow} pointerEvents="box-none">
            <View style={styles.leftCol}>
              <ChatInput sending={chat.sending} onSend={chat.send} />
            </View>
            {!hasTurns && shortcuts.length > 0 ? (
              <View style={styles.rightCol}>
                <ChatShortcutRail shortcuts={shortcuts} />
              </View>
            ) : (
              <View style={styles.fabSpacer} />
            )}
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

// Reserve column width equal to the FAB footprint so shortcut pills align
// directly above the FAB and the chat input sits cleanly to its left.
const SHORTCUT_COL_WIDTH = 150;
const FAB_COL = 60; // FAB diameter (52) + right margin (18) minus 10 of float

const styles = StyleSheet.create({
  kav: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  panel: {
    paddingHorizontal: 12,
    // Bottom padding matches the FAB's 14px so the chat input sits flush
    // with the bottom of the FAB without covering it.
    paddingBottom: 14,
    gap: 12,
  },
  conversation: {
    borderRadius: 16,
    borderWidth: 1,
    maxHeight: 440,
    overflow: 'hidden',
    marginRight: FAB_COL,
  },
  conversationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 4,
  },
  conversationTitle: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  resetLink: { fontSize: 12, fontWeight: '600' },
  bubbles: { paddingHorizontal: 10, paddingBottom: 10 },
  bubblesContent: { paddingBottom: 4 },

  bottomRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  leftCol: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  rightCol: {
    alignItems: 'stretch',
    width: SHORTCUT_COL_WIDTH,
    // The rail needs a bit of room above the FAB so the bottom pill
    // doesn't sit on top of the button.
    paddingBottom: 64,
  },
  fabSpacer: {
    // When conversation is open (shortcuts hidden) the right column
    // collapses to just the FAB's width so the input doesn't overlap
    // the button.
    width: FAB_COL,
  },
});
