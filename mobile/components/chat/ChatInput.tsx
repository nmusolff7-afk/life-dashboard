import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { useHaptics } from '../../lib/useHaptics';
import { useTokens } from '../../lib/theme';

interface Props {
  sending: boolean;
  onSend: (text: string) => void;
}

export function ChatInput({ sending, onSend }: Props) {
  const t = useTokens();
  const haptics = useHaptics();
  const [text, setText] = useState('');

  const canSend = !sending && text.trim().length > 0;

  const send = () => {
    if (!canSend) return;
    haptics.fire('tap');
    onSend(text.trim());
    setText('');
  };

  return (
    <View style={[styles.wrap, { backgroundColor: t.surface, borderColor: t.border }]}>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="Ask anything"
        placeholderTextColor={t.subtle}
        editable={!sending}
        maxLength={2000}
        multiline
        style={[styles.input, { color: t.text }]}
        onSubmitEditing={send}
        returnKeyType="send"
      />
      <Pressable
        onPress={send}
        disabled={!canSend}
        style={({ pressed }) => [
          styles.sendBtn,
          {
            backgroundColor: canSend ? t.accent : t.surface2,
            opacity: pressed ? 0.85 : 1,
          },
        ]}>
        <Ionicons
          name={sending ? 'hourglass-outline' : 'arrow-up'}
          size={20}
          color={canSend ? '#FFFFFF' : t.subtle}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    borderRadius: 26,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  input: {
    flex: 1,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 8,
    maxHeight: 120,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
