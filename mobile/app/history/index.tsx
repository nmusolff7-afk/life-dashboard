import { Stack } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { EmptyState } from '../../components/apex';
import { useTokens } from '../../lib/theme';

export default function HistoryScreen() {
  const t = useTokens();
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen
        options={{
          title: 'History',
          headerStyle: { backgroundColor: t.bg },
          headerTintColor: t.text,
          headerShadowVisible: false,
        }}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <EmptyState
          icon="📅"
          title="History coming soon"
          description="A browsable calendar of your logged days, meals, and workouts will land here in a later phase."
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 10, flexGrow: 1, justifyContent: 'center' },
});
