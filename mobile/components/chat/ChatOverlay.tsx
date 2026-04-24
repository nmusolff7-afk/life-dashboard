import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
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
 *    - Chat input pill sits BOTTOM-ALIGNED with the FAB (same baseline),
 *      to the LEFT of the FAB so the pill visually tucks under the
 *      button on the right edge
 *    - Prior turns render above the rail
 *
 *   EXPANDED (after user taps the input — focuses the TextInput)
 *    - Shortcut rail HIDDEN
 *    - Conversation card fills the screen from insets.top+12 down to
 *      just above the input. Back chevron lives INSIDE the card header.
 *    - Input widens (leaves FAB column reserved) and rises above the
 *      keyboard via tracked kbHeight
 *    - FAB rises in lock-step with the input so it always sits above
 *      the input on the right hand side (FAB reads chat.inputExpanded
 *      and its own kbHeight listener).
 */
const SHORTCUT_COL_WIDTH = 80;
const CLEARANCE_ABOVE_FAB = 2;
/** Offset to shift the shortcut rail relative to its default anchor
 *  above the FAB. Positive = down, negative = up. Founder tuned the
 *  pills 15pt higher than the earlier 13pt-down position, net −2pt. */
const RAIL_DOWN_SHIFT = -2;
/** Offset to shift the chat input pill DOWN so it reads as inline with
 *  the FAB's vertical band. Tuned independently of the rail per
 *  founder feedback. */
const INPUT_DOWN_SHIFT = 5;
/** Clearance above the system keyboard when the input is expanded.
 *  Founder-tuned up to 50pt so the pill sits well clear of the
 *  keyboard's top edge + home-indicator band. */
const INPUT_CLEAR_ABOVE_KB = 50;

/** FAB "resting" math constants — mirror FAB.tsx so the rail + input
 *  can anchor to where the FAB WOULD be (bottom-right above the tab
 *  bar) even after it migrates to the top-right while chat is open. */
const FAB_SIZE_DEFAULT = 52;
const FAB_RIGHT = 18;
const FAB_GAP_ABOVE_TAB_BAR = 12;
const TAB_BAR_HEIGHT = 64;

export function ChatOverlay() {
  const t = useTokens();
  const chat = useChatSession();
  const insets = useSafeAreaInsets();
  const anim = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<ScrollView>(null);
  const [dismissed, setDismissed] = useState(true);
  const [shortcutExpandedKey, setShortcutExpandedKey] = useState<string | null>(null);
  const [kbHeight, setKbHeight] = useState(0);

  // Expanded state is context-level so the FAB (at root, outside this
  // component tree) can react to it and rise above the keyboard.
  const expanded = chat.inputExpanded;
  const setExpanded = chat.setInputExpanded;

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
  }, [chat.visible, setExpanded]);

  // Android hardware/gesture back button handling while the chat is
  // open. Priority:
  //   1. Expanded chat → collapse back to FAB-inline state (don't
  //      close overlay, don't pop the route).
  //   2. Collapsed overlay → close the overlay.
  //   3. Otherwise let the system handle (route pop / app exit).
  // Returning true from the handler signals "we consumed it".
  useEffect(() => {
    if (!chat.visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (expanded) {
        setExpanded(false);
        Keyboard.dismiss();
        return true;
      }
      chat.close();
      return true;
    });
    return () => sub.remove();
  }, [chat.visible, expanded, setExpanded, chat]);

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

  // Anchor math — use the FAB's RESTING position (bottom-right above
  // the tab bar), NOT chat.fabAnchor. While the overlay is open the FAB
  // migrates to top-right, so its measured position is no longer the
  // natural anchor point for the rail/input. Computing the resting spot
  // directly keeps the rail/input in the same place whether the FAB is
  // currently up top or at rest.
  const screen = Dimensions.get('window');
  const fabSize = FAB_SIZE_DEFAULT;
  const restingFabBottomFromScreenBottom =
    TAB_BAR_HEIGHT + insets.bottom + FAB_GAP_ABOVE_TAB_BAR;
  const restingFabY = screen.height - restingFabBottomFromScreenBottom - fabSize;
  const restingFabX = screen.width - FAB_RIGHT - fabSize;
  const fabCenterX = restingFabX + fabSize / 2;

  // COLLAPSED positions. Rail and input have independent down-shift
  // constants so the founder can tune each one's alignment to the FAB
  // without disturbing the other.
  const railBottomFromScreenBottom =
    screen.height - restingFabY + CLEARANCE_ABOVE_FAB - RAIL_DOWN_SHIFT;
  const railLeft = fabCenterX - SHORTCUT_COL_WIDTH / 2;
  const inputRight = screen.width - restingFabX + 10;
  const INPUT_PILL_HEIGHT = 50;
  const inputBottomCollapsed =
    restingFabBottomFromScreenBottom - INPUT_DOWN_SHIFT;
  const conversationBottomCollapsed = railBottomFromScreenBottom;

  // EXPANDED positions
  const expandedInputBottom =
    kbHeight > 0 ? kbHeight + INPUT_CLEAR_ABOVE_KB : insets.bottom + 16;
  const expandedConversationTop = insets.top + 12;
  const expandedConversationBottom = expandedInputBottom + INPUT_PILL_HEIGHT + 8;

  const collapse = () => {
    setExpanded(false);
    Keyboard.dismiss();
  };

  const handleInputFocus = () => {
    if (!expanded) setExpanded(true);
  };

  return (
    <View pointerEvents={chat.visible ? 'auto' : 'none'} style={StyleSheet.absoluteFill}>
      {/* Dim backdrop. Sits BELOW the rail / input / FAB so they stay
          lit. Tapping collapses expansion or closes the overlay. */}
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

        {/* Conversation card. Collapsed: rises above rail on the LEFT of
            the FAB. Expanded: fullscreen card with back chevron in its
            own header. */}
        {(hasTurns || expanded) ? (
          <View
            pointerEvents="box-none"
            style={
              expanded
                ? [
                    styles.conversationAnchorExpanded,
                    { top: expandedConversationTop, bottom: expandedConversationBottom },
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
                {expanded ? (
                  <Pressable
                    onPress={collapse}
                    accessibilityRole="button"
                    accessibilityLabel="Collapse chat"
                    hitSlop={10}
                    style={styles.headerBackBtn}>
                    <Ionicons name="chevron-back" size={20} color={t.text} />
                  </Pressable>
                ) : null}
                <Text style={[styles.conversationTitle, { color: t.muted }]}>Chat</Text>
                {/* Top-right slot is reserved for the × FAB, which migrates
                    into this header when the chat is open. The FAB button
                    itself lives in app/_layout → FABHost; we just leave
                    empty space its size so the title stays centered. */}
                <View style={styles.headerFabSpacer} />
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

        {/* Chat input. Collapsed: left-of-FAB narrow. Expanded: wider
            but still leaves FAB column reserved so the FAB can sit
            above the input on the right. */}
        <View
          pointerEvents="box-none"
          style={
            expanded
              ? [styles.inputAnchor, { left: 12, right: inputRight, bottom: expandedInputBottom }]
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
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
  },
  headerBackBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  conversationTitle: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  headerFabSpacer: { width: 44, height: 44 },
  bubbles: { flex: 1, paddingHorizontal: 10, paddingBottom: 10 },
  bubblesContent: { paddingBottom: 4 },
  emptyHint: {
    fontSize: 13,
    fontStyle: 'italic',
    paddingVertical: 14,
    paddingHorizontal: 6,
    lineHeight: 18,
  },
});
