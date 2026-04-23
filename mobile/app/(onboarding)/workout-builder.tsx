import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '../../components/ui';
import { useTokens } from '../../lib/theme';

export default function WorkoutBuilderScreen() {
  const t = useTokens();
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const next = () => router.replace('/(onboarding)/connections');

  return (
    <View style={[styles.container, { backgroundColor: t.bg }]}>
      <View style={styles.body}>
        <Text style={styles.emoji}>🏋️</Text>
        <Text style={[styles.title, { color: t.text }]}>Want a training plan?</Text>
        <Text style={[styles.subtitle, { color: t.muted }]}>
          Life Dashboard can build you a weekly workout plan matched to your goal. You can always build one later from the Fitness tab.
        </Text>
      </View>
      <View style={styles.actions}>
        <Button title="Build a workout plan" onPress={() => setModalOpen(true)} />
        <Button title="Skip for now" variant="ghost" onPress={next} />
      </View>

      <Modal visible={modalOpen} transparent animationType="fade">
        <Pressable style={styles.backdrop} onPress={() => setModalOpen(false)}>
          <Pressable onPress={(e) => e.stopPropagation()} style={[styles.modalCard, { backgroundColor: t.surface, borderColor: t.border }]}>
            <Text style={[styles.modalTitle, { color: t.text }]}>Workout plan builder</Text>
            <Text style={[styles.modalBody, { color: t.muted }]}>Coming soon. In v1, you&apos;ll answer a few questions and Life Dashboard drafts a weekly plan you can edit.</Text>
            <Button title="Done" onPress={() => setModalOpen(false)} style={{ marginTop: 16 }} />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'space-between' },
  body: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 14 },
  emoji: { fontSize: 64 },
  title: { fontSize: 24, fontWeight: '700', textAlign: 'center' },
  subtitle: { fontSize: 15, lineHeight: 22, textAlign: 'center', maxWidth: 320 },
  actions: { gap: 12, paddingBottom: 24 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  modalCard: { borderRadius: 20, borderWidth: 1, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  modalBody: { fontSize: 14, lineHeight: 20, marginTop: 8 },
});
