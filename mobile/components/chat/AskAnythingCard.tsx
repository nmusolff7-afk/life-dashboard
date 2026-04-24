import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useChatSession, type Surface } from '../../lib/useChatSession';
import { useHaptics } from '../../lib/useHaptics';
import { useTokens } from '../../lib/theme';

interface Props {
  /** Which surface we're docked over — forwarded to chat.open so the
   *  system prompt can surface the right context container names. */
  surface: Surface;
}

/** Left-aligned card rendered at the END of each main tab's scroll.
 *  Fills the extra bottom space and gives the user a scroll-to-bottom
 *  affordance for opening the chatbot. Tapping opens the existing
 *  ChatOverlay with the surface-specific context.
 *
 *  Replaces the earlier docked pill — founder wanted this to live
 *  inline in the scroll content rather than floating above the tab
 *  bar. */
export function AskAnythingCard({ surface }: Props) {
  const t = useTokens();
  const haptics = useHaptics();
  const chat = useChatSession();

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => {
          haptics.fire('tap');
          chat.open(surface);
        }}
        accessibilityRole="button"
        accessibilityLabel="Open chat"
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: t.surface,
            borderColor: t.border,
            transform: [{ scale: pressed ? 0.99 : 1 }],
            opacity: pressed ? 0.9 : 1,
          },
        ]}>
        <View style={[styles.iconBubble, { backgroundColor: t.surface2 }]}>
          <Ionicons name="chatbubble-ellipses-outline" size={18} color={t.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: t.text }]}>Ask anything</Text>
          <Text style={[styles.sub, { color: t.muted }]} numberOfLines={1}>
            Your data, your questions. I'll answer in context.
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={t.subtle} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingTop: 8 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  iconBubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 14, fontWeight: '700' },
  sub: { fontSize: 12, marginTop: 2 },
});
