import { useRouter, Stack } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '../../components/ui';
import { useTokens } from '../../lib/theme';

export default function GoalsScreen() {
  const t = useTokens();
  const router = useRouter();

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen options={{ title: 'Goals', headerStyle: { backgroundColor: t.bg }, headerTintColor: t.text, headerShadowVisible: false }} />
      <ScrollView contentContainerStyle={styles.content}>
        {/* Active goals section — empty */}
        <Text style={[styles.sectionLabel, { color: t.muted }]}>Active goals</Text>
        <View style={[styles.emptyCard, { backgroundColor: t.surface, borderColor: t.border }]}>
          <Text style={styles.emoji}>🎯</Text>
          <Text style={[styles.emptyTitle, { color: t.text }]}>No active goals yet</Text>
          <Text style={[styles.emptyBody, { color: t.muted }]}>
            Add up to 3 goals on Core, 6 on Pro. Fitness body-composition goals drive your calorie targets; others just track progress.
          </Text>
          <Button
            title="Browse goal library"
            onPress={() => router.push('/goals/library')}
            style={{ marginTop: 8 }}
          />
        </View>

        {/* Archived hint */}
        <Text style={[styles.sectionLabel, { color: t.muted, marginTop: 8 }]}>Completed / archived</Text>
        <Pressable style={[styles.archivedCard, { backgroundColor: t.surface, borderColor: t.border }]}>
          <Text style={[styles.archivedText, { color: t.subtle }]}>Completed and archived goals appear here.</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 10 },
  sectionLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  emptyCard: { borderWidth: 1, borderRadius: 20, padding: 20, alignItems: 'center', gap: 10 },
  emoji: { fontSize: 40 },
  emptyTitle: { fontSize: 16, fontWeight: '700' },
  emptyBody: { fontSize: 13, lineHeight: 18, textAlign: 'center', maxWidth: 300 },
  archivedCard: { borderWidth: 1, borderRadius: 14, padding: 14 },
  archivedText: { fontSize: 13 },
});
