import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
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

/** Overlay anchored around the measured FAB position. The FAB reports
 *  its onscreen origin via chat.setFabAnchor; we read that here and
 *  position every child (shortcut rail, conversation, chat input) in
 *  coordinates relative to it. This way the layout is identical on SE
 *  through Pro Max without hardcoded per-device tweaks.
 *
 *  A dim backdrop sits below the shortcut rail / input / FAB in z-order
 *  so those three remain visually "lit" while the rest of the screen
 *  fades — matches the founder spec (everything dims except the FAB,
 *  text input box, and action buttons). */
const SHORTCUT_COL_WIDTH = 80;
const CLEARANCE_ABOVE_FAB = 16;
/** Extra lift for the chat input so it sits above the FAB by ~10pt more
 *  than the shortcut rail alignment would imply. Founder noted the input
 *  previously sat too low. */
const INPUT_EXTRA_LIFT = 10;

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

  const shortcuts: Shortcut[] = universalShortcuts({
    expandedKey,
    setExpandedKey,
    openQuickLog: chat.openQuickLog,
  });

  // Anchor math. If the FAB has reported its measured position, position
  // relative to that. Fall back to the spec'd defaults if we don't have
  // a measurement yet (first frame before onLayout fires).
  const screen = Dimensions.get('window');
  const fab = chat.fabAnchor;
  const FAB_SIZE_FALLBACK = 52;
  const fabSize = fab?.size ?? FAB_SIZE_FALLBACK;
  // In root-coords: FAB top-left (fabX, fabY).
  const fabX = fab ? fab.x : screen.width - 18 - FAB_SIZE_FALLBACK;
  const fabY = fab ? fab.y : screen.height - insets.bottom - 14 - FAB_SIZE_FALLBACK;
  const fabCenterX = fabX + fabSize / 2;

  // Shortcut rail bottom sits CLEARANCE_ABOVE_FAB above the FAB's top
  // edge. Column centered horizontally on the FAB's center.
  const railBottomFromScreenBottom = screen.height - fabY + CLEARANCE_ABOVE_FAB;
  const railLeft = fabCenterX - SHORTCUT_COL_WIDTH / 2;

  // Chat input sits to the LEFT of the FAB, with its bottom edge at the
  // FAB's top edge minus an extra lift so the pill never grazes the
  // rotating +. Right edge reserves the FAB column + a small gap.
  const inputRight = screen.width - fabX + 10;
  const inputBottomFromScreenBottom = railBottomFromScreenBottom + INPUT_EXTRA_LIFT;

  return (
    <View pointerEvents={chat.visible ? 'auto' : 'none'} style={StyleSheet.absoluteFill}>
      {/* Dim backdrop. Sits BELOW the shortcut rail / input / FAB in the
          z-stack so they stay visually lit while the rest of the screen
          fades. Tapping it dismisses. */}
      <Animated.View
        pointerEvents={chat.visible ? 'auto' : 'none'}
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: '#000',
            opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.5] }),
          },
        ]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={chat.close} />
      </Animated.View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={StyleSheet.absoluteFill}
        pointerEvents="box-none">
        <Animated.View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { opacity: anim }]}>
          {!hasTurns ? (
            <View
              pointerEvents="box-none"
              style={[
                styles.railAnchor,
                {
                  left: railLeft,
                  bottom: railBottomFromScreenBottom,
                  width: SHORTCUT_COL_WIDTH,
                },
              ]}>
              <ChatShortcutRail shortcuts={shortcuts} />
            </View>
          ) : null}

          {hasTurns ? (
            <View
              pointerEvents="box-none"
              style={[
                styles.conversationAnchor,
                {
                  left: 12,
                  right: inputRight,
                  bottom: railBottomFromScreenBottom,
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

          <View
            pointerEvents="box-none"
            style={[
              styles.inputAnchor,
              {
                left: 12,
                right: inputRight,
                bottom: inputBottomFromScreenBottom,
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
  railAnchor: { position: 'absolute', alignItems: 'stretch' },
  inputAnchor: { position: 'absolute' },
  conversationAnchor: { position: 'absolute', maxHeight: 420 },
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
