import { Ionicons } from '@expo/vector-icons';
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

/** PRD §4.7.4 layout, founder-locked:
 *  - Dim backdrop — tap to dismiss
 *  - RIGHT half: vertical shortcut stack (all same width), immediately
 *    above the FAB-position X close button
 *  - LEFT half: chat area — input bubble at the bottom-left (directly left
 *    of the X), conversation rises up to the left of the shortcut stack
 *  - When conversation has turns: shortcuts collapse, chat area expands
 *    to full width for comfortable reading
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
  const panelTranslate = anim.interpolate({ inputRange: [0, 1], outputRange: [30, 0] });
  const hasTurns = chat.turns.length > 0;

  const shortcuts: Shortcut[] = shortcutsForSurface(chat.surface, {
    router,
    closeOverlay: chat.close,
  });

  return (
    <View pointerEvents={chat.visible ? 'auto' : 'none'} style={StyleSheet.absoluteFill}>
      {/* Dim backdrop */}
      <Animated.View
        pointerEvents={chat.visible ? 'auto' : 'none'}
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: '#000', opacity: backdropOpacity },
        ]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={chat.close} />
      </Animated.View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.kav}
        pointerEvents="box-none">
        <Animated.View
          pointerEvents="box-none"
          style={[
            styles.panel,
            {
              opacity: anim,
              transform: [{ translateY: panelTranslate }],
            },
          ]}>
          {/* Conversation — occupies the left half when present. When the
              conversation has content, shortcuts collapse and the chat
              area expands to full width for readability. */}
          {hasTurns ? (
            <View
              style={[
                styles.conversation,
                {
                  backgroundColor: t.bg + 'EE',
                  borderColor: t.border,
                },
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

          {/* Bottom row — shortcut rail on right half (stacked above X),
              chat input on left half (immediately left of X). When chat
              has messages the shortcut rail disappears and input grows
              to full width. */}
          <View style={styles.bottomRow} pointerEvents="box-none">
            <View style={styles.leftCol}>
              <View style={[styles.inputWrap, hasTurns && styles.inputWrapWide]}>
                <ChatInput sending={chat.sending} onSend={chat.send} />
              </View>
            </View>

            <View style={styles.rightCol}>
              {/* Shortcut rail above X, same width column */}
              {!hasTurns && shortcuts.length > 0 ? (
                <ChatShortcutRail shortcuts={shortcuts} />
              ) : null}
              <Pressable
                onPress={chat.close}
                accessibilityRole="button"
                accessibilityLabel="Close chat"
                style={({ pressed }) => [
                  styles.closeBtn,
                  {
                    backgroundColor: t.accent,
                    opacity: pressed ? 0.88 : 1,
                    transform: [{ scale: pressed ? 0.95 : 1 }],
                  },
                ]}>
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </Pressable>
            </View>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

const SHORTCUT_COL_WIDTH = 150;

const styles = StyleSheet.create({
  kav: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  panel: {
    paddingHorizontal: 12,
    paddingBottom: 18,
    gap: 12,
  },
  conversation: {
    borderRadius: 16,
    borderWidth: 1,
    maxHeight: 440,
    overflow: 'hidden',
    // Leave room on the right so the conversation doesn't render behind
    // the X button when shortcuts are hidden.
    marginRight: 4,
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
    gap: 12,
  },
  leftCol: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  inputWrap: {
    // By default the input sits in the left column. Width is constrained
    // so the right column (shortcut rail + X) has dedicated space.
    alignSelf: 'stretch',
  },
  inputWrapWide: {
    // Once the conversation is open and shortcuts collapse, the input
    // grows out to the full available width.
  },
  rightCol: {
    alignItems: 'stretch',
    width: SHORTCUT_COL_WIDTH,
    gap: 10,
  },
  closeBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignSelf: 'flex-end',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 6,
  },
});

/** Exported so ChatShortcutRail can target the right-column width. */
export const CHAT_SHORTCUT_COL_WIDTH = SHORTCUT_COL_WIDTH;
