import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { useChatSession } from '../../lib/useChatSession';
import { useHaptics } from '../../lib/useHaptics';
import { useTokens } from '../../lib/theme';

interface Props {
  sending: boolean;
  onSend: (text: string) => void;
  /** Autofocus the input when first rendered. */
  autoFocus?: boolean;
  /** Fired when the TextInput gains keyboard focus — parent uses this
   *  to expand the overlay (fullscreen bubbles, widen input, hide
   *  shortcuts). */
  onFocus?: () => void;
}

/** Chat input pill. Syncs its text state with chat.draftText so messages
 *  typed into the ChatDock carry over into the expanded overlay and vice
 *  versa. */
export function ChatInput({ sending, onSend, autoFocus, onFocus }: Props) {
  const t = useTokens();
  const haptics = useHaptics();
  const chat = useChatSession();
  const [text, setText] = useState(chat.draftText);
  const inputRef = useRef<TextInput>(null);

  // When the overlay opens with a draft from the dock, sync once so we
  // show that text inside the expanded input.
  useEffect(() => {
    setText(chat.draftText);
    // intentionally only when draftText changes externally
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.draftText]);

  useEffect(() => {
    if (autoFocus) {
      const id = setTimeout(() => inputRef.current?.focus(), 60);
      return () => clearTimeout(id);
    }
  }, [autoFocus]);

  const handleChange = (v: string) => {
    setText(v);
    chat.setDraftText(v);
  };

  const canSend = !sending && text.trim().length > 0;

  const send = () => {
    if (!canSend) return;
    haptics.fire('tap');
    const body = text.trim();
    onSend(body);
    setText('');
    chat.setDraftText('');
  };

  return (
    <View style={[styles.wrap, { backgroundColor: t.surface, borderColor: t.border }]}>
      <TextInput
        ref={inputRef}
        value={text}
        onChangeText={handleChange}
        onFocus={onFocus}
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
        accessibilityLabel="Send message"
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
