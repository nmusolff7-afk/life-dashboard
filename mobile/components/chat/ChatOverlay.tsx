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

import { useChatSession, type Surface } from '../../lib/useChatSession';
import { useTokens } from '../../lib/theme';
import { ChatBubble, TypingBubble } from './ChatBubble';
import { ChatInput } from './ChatInput';
import { ChatShortcutRail, type Shortcut } from './ChatShortcutRail';
import { shortcutsForSurface } from './surfaceShortcuts';

/** Root portal rendered once at the tabs layout. Invisible until the FAB
 *  opens it. PRD §4.7.4 layout: dimmed backdrop, chat input pill above
 *  the X, vertical shortcut rail above the input.
 *
 *  Animation v1 is deliberately simple — a fade on the backdrop and
 *  slide-up on the input panel. Full 200ms rotate + spring polish can
 *  come in Phase 11. Focus here is behavior. */
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

  // Auto-scroll conversation to bottom when turns change
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
          {/* Conversation area — visible once user sends a message */}
          {hasTurns ? (
            <View style={[styles.conversation, { backgroundColor: t.bg + 'EE', borderColor: t.border }]}>
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

          <View style={styles.bottomRow} pointerEvents="box-none">
            {/* Shortcut rail — hidden while conversation has content */}
            {!hasTurns ? (
              <View style={styles.railWrap}>
                <ChatShortcutRail shortcuts={shortcuts} />
              </View>
            ) : (
              <View style={{ flex: 1 }} />
            )}

            <View style={styles.inputColumn}>
              <View style={styles.inputWrap}>
                <ChatInput sending={chat.sending} onSend={chat.send} />
              </View>
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
    maxHeight: 420,
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

  bottomRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  railWrap: {
    flex: 1,
    alignItems: 'flex-end',
  },
  inputColumn: {
    alignItems: 'flex-end',
    gap: 10,
  },
  inputWrap: {
    minWidth: 220,
    maxWidth: 260,
  },
  closeBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 6,
  },
});
