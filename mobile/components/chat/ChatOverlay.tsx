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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useChatSession } from '../../lib/useChatSession';
import { useTokens } from '../../lib/theme';
import { ChatBubble, TypingBubble } from './ChatBubble';
import { ChatInput } from './ChatInput';
import { ChatShortcutRail, type Shortcut } from './ChatShortcutRail';
import { universalShortcuts } from './surfaceShortcuts';

/** FAB layout math: FAB is at `bottom: 14`, `right: 18`, size 52. Overlay
 *  content must sit directly around that fixed button:
 *    - Chat input pill: aligned bottom-left, its bottom at FAB bottom
 *    - Shortcut rail: stacked vertically in a column whose bottom edge
 *      sits flush with the TOP of the FAB (so the lowest pill is right
 *      above the button).
 *  No translateY on open — content fades in place while the FAB itself
 *  rotates. */
const FAB_SIZE = 52;
const FAB_BOTTOM = 14;
const FAB_RIGHT = 18;
// Shortcut column is sized to roughly match the FAB's own footprint so
// pills stack directly over the button. 80pt is wide enough for the
// compact "icon over tiny label" pill without looking crammed.
const SHORTCUT_COL_WIDTH = 80;

export function ChatOverlay() {
  const t = useTokens();
  const chat = useChatSession();
  const insets = useSafeAreaInsets();
  const anim = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<ScrollView>(null);
  const [dismissed, setDismissed] = useState(true);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

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
    if (!chat.visible) setExpandedKey(null);
  }, [chat.visible]);

  useEffect(() => {
    if (chat.turns.length > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 40);
    }
  }, [chat.turns.length]);

  if (dismissed) return null;

  const hasTurns = chat.turns.length > 0;

  // Universal shortcuts — identical across every surface per founder.
  // All leaves fire openQuickLog, which dismisses the overlay and pops
  // the matching entry modal (see QuickLogHost).
  const shortcuts: Shortcut[] = universalShortcuts({
    expandedKey,
    setExpandedKey,
    openQuickLog: chat.openQuickLog,
  });

  // Content sits well above the FAB so the rotating + stays visible and
  // the shortcut pills / input pill never visually graze the button.
  // CONTENT_LIFT: raises the shortcut rail / input higher than the
  // previous 20pt clearance — the founder flagged content still sat too
  // low obscuring the FAB shadow.
  const CONTENT_LIFT = 72;
  const fabTopOffset = FAB_BOTTOM + FAB_SIZE + insets.bottom + CONTENT_LIFT;
  const inputBottomOffset = FAB_BOTTOM + insets.bottom + CONTENT_LIFT;

  return (
    <View pointerEvents={chat.visible ? 'auto' : 'none'} style={StyleSheet.absoluteFill}>
      {/* Transparent tap-to-close catcher. No dim — the founder wants the
          underlying screen (and the FAB itself) to stay visible when the
          overlay is open. */}
      <Pressable
        pointerEvents={chat.visible ? 'auto' : 'none'}
        style={StyleSheet.absoluteFill}
        onPress={chat.close}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={StyleSheet.absoluteFill}
        pointerEvents="box-none">
        <Animated.View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { opacity: anim }]}>
          {/* Shortcut rail — anchored horizontally centered over the
              FAB so pills stack directly above the rotating +. Width
              matches FAB footprint (~80pt) per founder spec. */}
          {!hasTurns ? (
            <View
              pointerEvents="box-none"
              style={[
                styles.railAnchor,
                {
                  // Center column over FAB: FAB left edge = right:18 + 26 (half of 52)
                  // so the column's center aligns with the FAB's center.
                  right: FAB_RIGHT + FAB_SIZE / 2 - SHORTCUT_COL_WIDTH / 2,
                  bottom: fabTopOffset + 10,
                  width: SHORTCUT_COL_WIDTH,
                },
              ]}>
              <ChatShortcutRail shortcuts={shortcuts} />
            </View>
          ) : null}

          {/* Conversation — rises up on the LEFT when turns exist. Reserves
              right-side column for the shortcut rail / FAB. */}
          {hasTurns ? (
            <View
              pointerEvents="box-none"
              style={[
                styles.conversationAnchor,
                {
                  left: 12,
                  right: FAB_RIGHT + FAB_SIZE + 10,
                  bottom: fabTopOffset + 10,
                },
              ]}>
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
            </View>
          ) : null}

          {/* Chat input — bottom-left, its bottom flush with FAB bottom. */}
          <View
            pointerEvents="box-none"
            style={[
              styles.inputAnchor,
              {
                left: 12,
                right: FAB_RIGHT + FAB_SIZE + 10,
                bottom: inputBottomOffset,
              },
            ]}>
            <ChatInput sending={chat.sending} onSend={chat.send} />
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  railAnchor: {
    position: 'absolute',
    alignItems: 'stretch',
  },
  inputAnchor: {
    position: 'absolute',
  },
  conversationAnchor: {
    position: 'absolute',
    maxHeight: 420,
  },
  conversation: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
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
});
