import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { useTokens } from '../../lib/theme';

interface Props {
  onPress?: () => void;
}

export function FAB({ onPress }: Props) {
  const t = useTokens();
  const router = useRouter();
  const handlePress = onPress ?? (() => router.push('/chatbot'));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Ask Life Dashboard"
      onPress={handlePress}
      style={({ pressed }) => [
        styles.fab,
        { backgroundColor: t.accent, opacity: pressed ? 0.85 : 1, shadowColor: '#000' },
      ]}>
      <Text style={styles.icon}>✨</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  icon: { fontSize: 22 },
});
