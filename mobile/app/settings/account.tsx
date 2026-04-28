import { useAuth } from '@clerk/clerk-expo';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';

import { SettingsRow } from '../../components/apex';
import { Button } from '../../components/ui';
import { apiFetch } from '../../lib/api';
import { clearFlaskToken } from '../../lib/flaskToken';
import { useTokens } from '../../lib/theme';

const DELETE_CONFIRMATION = 'DELETE';

export default function AccountSettings() {
  const t = useTokens();
  const router = useRouter();
  const { signOut } = useAuth();
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [typed, setTyped] = useState('');

  const handleSignOut = async () => {
    clearFlaskToken();
    await signOut();
    router.replace('/(auth)/sign-in');
  };

  const openDeleteModal = () => {
    setTyped('');
    setConfirmOpen(true);
  };

  const performDelete = async () => {
    setDeleting(true);
    setConfirmOpen(false);
    try {
      const res = await apiFetch('/api/delete-account', { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `delete-account → ${res.status}`);
      }
      clearFlaskToken();
      try {
        await signOut();
      } catch {
        // Clerk sign-out failure shouldn't block the redirect.
      }
      router.replace('/(auth)/sign-in');
    } catch (e) {
      Alert.alert('Delete failed', e instanceof Error ? e.message : String(e));
      setDeleting(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen
        options={{
          title: 'Data & account',
          headerStyle: { backgroundColor: t.bg },
          headerTintColor: t.text,
          headerShadowVisible: false,
        }}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <SettingsRow
          title="Export my data"
          hint="CSV (Core) / PDF (Pro) — backend export endpoint is not live yet."
          onPress={() =>
            Alert.alert(
              'Export not ready yet',
              'Export requires a new Flask endpoint that isn\'t shipped in this cycle. Once it lands you\'ll get a downloadable CSV (or PDF on Pro). We\'ll email you when it\'s available. Until then, use Delete account below to permanently remove your data.',
            )
          }
        />
        <SettingsRow
          title="Re-run onboarding"
          hint="Walk through the wizard again — body stats, diet, goal. Your meals / workouts / history are preserved."
          onPress={() => router.push('/(onboarding)/step-1' as never)}
        />
        <SettingsRow title="Sign out" onPress={handleSignOut} />
        <SettingsRow
          title={deleting ? 'Deleting…' : 'Delete account'}
          hint="Permanently removes meals, workouts, weight + all settings"
          destructive
          onPress={deleting ? undefined : openDeleteModal}
        />
        {deleting ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={t.danger} />
            <Text style={[styles.loadingText, { color: t.muted }]}>
              Deleting account and all associated data…
            </Text>
          </View>
        ) : null}
      </ScrollView>

      {/* Typed-confirmation modal per PRD §4.11 — user must type DELETE to
          enable the destructive button. Explicitly not an Alert because
          Alert buttons can be tapped too quickly. */}
      <Modal
        visible={confirmOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setConfirmOpen(false)}>
          <Pressable
            style={[styles.modalCard, { backgroundColor: t.surface, borderColor: t.border }]}
            onPress={(e) => e.stopPropagation()}>
            <Text style={[styles.modalTitle, { color: t.text }]}>Delete account?</Text>
            <Text style={[styles.modalBody, { color: t.muted }]}>
              This permanently removes every meal, workout, weight log, goal, and preference tied to this account. It cannot be undone.
            </Text>
            <Text style={[styles.modalBody, { color: t.muted, marginTop: 10 }]}>
              Type <Text style={{ fontWeight: '800', color: t.text }}>{DELETE_CONFIRMATION}</Text> below to enable the button.
            </Text>
            <TextInput
              value={typed}
              onChangeText={setTyped}
              placeholder={DELETE_CONFIRMATION}
              placeholderTextColor={t.subtle}
              autoCapitalize="characters"
              autoCorrect={false}
              style={[styles.confirmInput, { color: t.text, borderColor: t.border, backgroundColor: t.bg }]}
            />
            <View style={styles.modalActions}>
              <Button title="Cancel" variant="ghost" onPress={() => setConfirmOpen(false)} />
              <Button
                title="Delete forever"
                variant="danger"
                disabled={typed.trim() !== DELETE_CONFIRMATION}
                onPress={performDelete}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 8, paddingBottom: 40 },
  loadingRow: { flexDirection: 'row', gap: 10, alignItems: 'center', padding: 12 },
  loadingText: { fontSize: 13 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: { borderWidth: 1, borderRadius: 16, padding: 20, gap: 8, width: '100%', maxWidth: 400 },
  modalTitle: { fontSize: 18, fontWeight: '800' },
  modalBody: { fontSize: 14, lineHeight: 20 },
  confirmInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, marginTop: 10 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 14 },
});
