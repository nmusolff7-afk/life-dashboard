import { StyleSheet, Text, View } from 'react-native';

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

export function TypingBubble() {
  const t = useTokens();
  return (
    <View style={[styles.row, { justifyContent: 'flex-start' }]}>
      <View style={[styles.bubble, { backgroundColor: t.surface, borderColor: t.border }]}>
        <Text style={[styles.text, { color: t.muted }]}>…</Text>
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
  text: { fontSize: 14, lineHeight: 19 },
});
