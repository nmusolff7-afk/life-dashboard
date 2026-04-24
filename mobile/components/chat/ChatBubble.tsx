import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import type { ChatTurn } from '../../lib/useChatSession';
import { useTokens } from '../../lib/theme';

interface Props {
  turn: ChatTurn;
}

export function ChatBubble({ turn }: Props) {
  const t = useTokens();
  const isUser = turn.role === 'user';
  const bg = isUser ? t.accent : t.surface;
  const fg = isUser ? '#FFFFFF' : t.text;

  return (
    <View style={[styles.row, { justifyContent: isUser ? 'flex-end' : 'flex-start' }]}>
      <View
        style={[
          styles.bubble,
          {
            backgroundColor: bg,
            borderBottomRightRadius: isUser ? 4 : 14,
            borderBottomLeftRadius: isUser ? 14 : 4,
            borderColor: isUser ? 'transparent' : t.border,
          },
        ]}>
        <Text style={[styles.text, { color: fg }]}>{turn.content}</Text>
      </View>
    </View>
  );
}

/** Animated three-dot typing indicator per 11.5.11. Each dot fades on a
 *  staggered loop so the bubble reads as "Claude is typing" rather than
 *  a static ellipsis. */
export function TypingBubble() {
  const t = useTokens();
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animateDot = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, {
            toValue: 1,
            duration: 350,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0.3,
            duration: 350,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );

    const a1 = animateDot(dot1, 0);
    const a2 = animateDot(dot2, 150);
    const a3 = animateDot(dot3, 300);
    a1.start();
    a2.start();
    a3.start();
    return () => {
      a1.stop();
      a2.stop();
      a3.stop();
    };
  }, [dot1, dot2, dot3]);

  return (
    <View style={[styles.row, { justifyContent: 'flex-start' }]}>
      <View style={[styles.bubble, styles.typingBubble, { backgroundColor: t.surface, borderColor: t.border }]}>
        <Animated.View style={[styles.dot, { backgroundColor: t.muted, opacity: dot1 }]} />
        <Animated.View style={[styles.dot, { backgroundColor: t.muted, opacity: dot2 }]} />
        <Animated.View style={[styles.dot, { backgroundColor: t.muted, opacity: dot3 }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', marginVertical: 4, paddingHorizontal: 2 },
  bubble: {
    maxWidth: '86%',
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { fontSize: 14, lineHeight: 19 },
});
