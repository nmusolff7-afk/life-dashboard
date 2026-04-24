import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Keyboard,
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

/** Overlay anchored around the measured FAB position.
 *
 *  Two visual states:
 *
 *   COLLAPSED (default after FAB tap)
 *    - Shortcut rail stacks above the FAB
 *    - Chat input pill sits inline to the LEFT of the FAB at the FAB's
 *      vertical band
 *    - If there are prior turns, the conversation panel rises above the
 *      rail with scrollback
 *
 *   EXPANDED (after user taps the input — focuses the TextInput)
 *    - Shortcut rail HIDDEN
 *    - Conversation bubbles fill most of the screen (wider — occupy
 *      from 12pt on the left to 12pt on the right)
 *    - Input WIDENS to the same horizontal span and sits above the
 *      keyboard (KeyboardAvoidingView lifts it)
 *    - FAB stays bottom-right, still rotated to ×
 *    - Back button in the input pill collapses back to COLLAPSED without
 *      closing the overlay (restores shortcuts + tucks input back)
 */
const SHORTCUT_COL_WIDTH = 80;
const CLEARANCE_ABOVE_FAB = 2;

export function ChatOverlay() {
  const t = useTokens();
  const chat = useChatSession();
  const insets = useSafeAreaInsets();
  const anim = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<ScrollView>(null);
  const [dismissed, setDismissed] = useState(true);
  const [shortcutExpandedKey, setShortcutExpandedKey] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [kbHeight, setKbHeight] = useState(0);

  // Manually track keyboard height so absolutely-positioned children
  // (input pill, conversation panel) can lift above the keyboard.
  // KeyboardAvoidingView with behavior="padding" doesn't reliably push
  // children that use `bottom: X` positioning — the padding shrinks the
  // content area but absolute children measured-from-bottom don't track
  // that on every iOS version. This direct approach always works.
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const sub1 = Keyboard.addListener(showEvt, (e) => setKbHeight(e.endCoordinates?.height ?? 0));
    const sub2 = Keyboard.addListener(hideEvt, () => setKbHeight(0));
    return () => { sub1.remove(); sub2.remove(); };
  }, []);

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
    if (!chat.visible) {
      setShortcutExpandedKey(null);
      setExpanded(false);
    }
  }, [chat.visible]);

  useEffect(() => {
    if (chat.turns.length > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 40);
    }
  }, [chat.turns.length]);

  if (dismissed) return null;

  const hasTurns = chat.turns.length > 0;

  const shortcuts: Shortcut[] = universalShortcuts({
    expandedKey: shortcutExpandedKey,
    setExpandedKey: setShortcutExpandedKey,
    openQuickLog: chat.openQuickLog,
  });

  // Anchor math keyed off the measured FAB position.
  const screen = Dimensions.get('window');
  const fab = chat.fabAnchor;
  const FAB_SIZE_FALLBACK = 52;
  const fabSize = fab?.size ?? FAB_SIZE_FALLBACK;
  const fabX = fab ? fab.x : screen.width - 18 - FAB_SIZE_FALLBACK;
  const fabY = fab ? fab.y : screen.height - insets.bottom - 14 - FAB_SIZE_FALLBACK;
  const fabCenterX = fabX + fabSize / 2;

  // COLLAPSED positions
  const railBottomFromScreenBottom = screen.height - fabY + CLEARANCE_ABOVE_FAB;
  const railLeft = fabCenterX - SHORTCUT_COL_WIDTH / 2;
  const inputRight = screen.width - fabX + 10;
  const fabBottomFromScreenBottom = screen.height - (fabY + fabSize);
  const INPUT_PILL_HEIGHT = 50;
  const inputBottomCollapsed =
    fabBottomFromScreenBottom + (fabSize - INPUT_PILL_HEIGHT) / 2;
  const conversationBottomCollapsed = railBottomFromScreenBottom;

  // EXPANDED positions — input widens full-width (minus 12pt gutters)
  // and sits above the keyboard. Bottom offset includes measured
  // keyboard height when the keyboard is open.
  const expandedInputBottom = kbHeight > 0 ? kbHeight + 8 : insets.bottom + 8;
  // Back chevron lives at insets.top + 8 and is ~44pt tall; leave room.
  const expandedConversationTop = insets.top + 60;

  const collapse = () => {
    setExpanded(false);
    Keyboard.dismiss();
  };

  const handleInputFocus = () => {
    if (!expanded) setExpanded(true);
  };

  return (
    <View pointerEvents={chat.visible ? 'auto' : 'none'} style={StyleSheet.absoluteFill}>
      {/* Dim backdrop. Sits BELOW the shortcut rail / input / FAB so
          they stay lit. Tapping it dismisses the overlay. */}
      <Animated.View
        pointerEvents={chat.visible ? 'auto' : 'none'}
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: '#000',
            opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.5] }),
          },
        ]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={expanded ? collapse : chat.close}
        />
      </Animated.View>

      <Animated.View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { opacity: anim }]}>
          {/* Top-left back chevron — visible only when expanded.
              Collapses the overlay back to the FAB-inline state without
              closing or sending. Positioned with safe-area top inset so
              it clears the status bar on every device. */}
          {expanded ? (
            <Pressable
              onPress={collapse}
              accessibilityRole="button"
              accessibilityLabel="Collapse chat"
              hitSlop={10}
              style={[
                styles.backBtnTopLeft,
                {
                  top: insets.top + 8,
                  left: 12,
                  backgroundColor: t.surface,
                  borderColor: t.border,
                },
              ]}>
              <Ionicons name="chevron-back" size={22} color={t.text} />
            </Pressable>
          ) : null}
          {/* Shortcut rail — hidden while expanded or when there are
              prior turns (conversation takes its place). */}
          {!hasTurns && !expanded ? (
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

          {/* Conversation panel. Collapsed state: rises above the rail on
              the LEFT of the FAB. Expanded state: fullscreen width, tall,
              anchored above the input. */}
          {(hasTurns || expanded) ? (
            <View
              pointerEvents="box-none"
              style={
                expanded
                  ? [
                      styles.conversationAnchorExpanded,
                      { top: expandedConversationTop, bottom: expandedInputBottom + INPUT_PILL_HEIGHT + 8 },
                    ]
                  : [
                      styles.conversationAnchor,
                      { left: 12, right: inputRight, bottom: conversationBottomCollapsed },
                    ]
              }>
              <View
                style={[
                  styles.conversation,
                  { backgroundColor: t.bg + 'EE', borderColor: t.border },
                ]}>
                <View style={styles.conversationHeader}>
                  <Text style={[styles.conversationTitle, { color: t.muted }]}>Chat</Text>
                  <Pressable
                    onPress={chat.reset}
                    accessibilityRole="button"
                    accessibilityLabel="Clear conversation">
                    <Text style={[styles.resetLink, { color: t.accent }]}>Clear</Text>
                  </Pressable>
                </View>
                <ScrollView
                  ref={scrollRef}
                  style={styles.bubbles}
                  contentContainerStyle={styles.bubblesContent}
                  keyboardShouldPersistTaps="handled">
                  {chat.turns.length === 0 && expanded ? (
                    <Text style={[styles.emptyHint, { color: t.subtle }]}>
                      Ask anything about your data. I only see what's on your
                      dashboard — no advice, just answers.
                    </Text>
                  ) : null}
                  {chat.turns.map((turn) => (
                    <ChatBubble key={turn.id} turn={turn} />
                  ))}
                  {chat.sending ? <TypingBubble /> : null}
                </ScrollView>
              </View>
            </View>
          ) : null}

          {/* Chat input. Collapsed: left-of-FAB narrow. Expanded: full-
              width above the keyboard, back-chevron collapses. */}
          <View
            pointerEvents="box-none"
            style={
              expanded
                ? [styles.inputAnchor, { left: 12, right: 12, bottom: expandedInputBottom }]
                : [styles.inputAnchor, { left: 12, right: inputRight, bottom: inputBottomCollapsed }]
            }>
            <ChatInput
              sending={chat.sending}
              onSend={chat.send}
              onFocus={handleInputFocus}
            />
          </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  railAnchor: { position: 'absolute', alignItems: 'stretch' },
  inputAnchor: { position: 'absolute' },
  conversationAnchor: { position: 'absolute', maxHeight: 420 },
  conversationAnchorExpanded: {
    position: 'absolute',
    left: 12,
    right: 12,
  },
  conversation: {
    flex: 1,
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
  bubbles: { flex: 1, paddingHorizontal: 10, paddingBottom: 10 },
  bubblesContent: { paddingBottom: 4 },
  emptyHint: {
    fontSize: 13,
    fontStyle: 'italic',
    paddingVertical: 14,
    paddingHorizontal: 6,
    lineHeight: 18,
  },
  backBtnTopLeft: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
