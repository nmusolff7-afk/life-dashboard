import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useChatSession, type Surface } from '../../lib/useChatSession';
// Dock import ordering — intentionally a single component since each tab
// mounts its own instance with its `surface` so the chat system prompt
// can surface the right context container names.
import { useHaptics } from '../../lib/useHaptics';
import { useTokens } from '../../lib/theme';

interface Props {
  /** Which surface we're docked over — forwarded to chat.open so the
   *  system prompt can surface the relevant container names. */
  surface: Surface;
}

/** Persistent chat dock on the bottom-left of each main tab (per 11.5.12).
 *  Single-line pill. Tapping or focusing the input opens the full
 *  ChatOverlay with draftText prefilled so the user never loses a
 *  mid-sentence thought. The FAB remains bottom-right; the dock + FAB
 *  coexist in the same safe-area band above the tab bar. */
export function ChatDock({ surface }: Props) {
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const chat = useChatSession();
  const haptics = useHaptics();

  // Hidden while the overlay is open — avoids a double input stack.
  if (chat.visible) return null;

  const openChat = () => {
    haptics.fire('tap');
    chat.open(surface);
  };

  return (
    <View
      // Sits above the tab bar (the FlaskTabBar has height 64 + insets.bottom).
      // We live 10pt above that. Right edge reserves the FAB column
      // (right:18 + size 52 + gap 12).
      pointerEvents="box-none"
      style={[
        styles.wrap,
        {
          bottom: 64 + insets.bottom + 10,
          right: 18 + 52 + 12,
          backgroundColor: t.surface,
          borderColor: t.border,
        },
      ]}>
      <Pressable
        onPress={openChat}
        accessibilityRole="button"
        accessibilityLabel="Open chat"
        style={styles.iconBtn}>
        <Ionicons name="chatbubble-ellipses-outline" size={16} color={t.muted} />
      </Pressable>
      {/* The TextInput here is deliberately read-only-at-rest: focusing
          it launches the full overlay instead of starting a multi-line
          edit in-place. This matches 11.5.11 — dock is a single-line
          affordance, expansion happens on tap. */}
      <Pressable style={styles.fakeInput} onPress={openChat} accessibilityLabel="Open chat to type">
        {chat.draftText ? (
          <Text style={[styles.draftText, { color: t.text }]} numberOfLines={1}>
            {chat.draftText}
          </Text>
        ) : (
          <Text style={[styles.placeholder, { color: t.subtle }]} numberOfLines={1}>
            Ask anything
          </Text>
        )}
      </Pressable>
      {/* Screen-reader-only real input: kept out of layout flow so the
          Pressables above control the opening gesture. */}
      <TextInput
        value=""
        editable={false}
        style={{ width: 0, height: 0 }}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 22,
    paddingVertical: 8,
    paddingLeft: 10,
    paddingRight: 14,
    // Subtle shadow so the dock reads as floating above tab content.
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 4,
  },
  iconBtn: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fakeInput: {
    flex: 1,
    paddingVertical: 4,
  },
  draftText: { fontSize: 14, fontWeight: '500' },
  placeholder: { fontSize: 14 },
});
