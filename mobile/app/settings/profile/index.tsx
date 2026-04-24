import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { SettingsRow } from '../../../components/apex';
import { fetchProfileSyncStatus, type ProfileSyncStatus } from '../../../lib/api/profile';
import { useTokens } from '../../../lib/theme';

export default function ProfileIndex() {
  const t = useTokens();
  const router = useRouter();
  const [sync, setSync] = useState<ProfileSyncStatus | null>(null);

  // Re-check the AI-profile sync flag every time we focus this screen —
  // diet edits on child pages flip the flag server-side, and we want the
  // nudge to appear right when the user returns.
  useFocusEffect(
    useCallback(() => {
      fetchProfileSyncStatus()
        .then(setSync)
        .catch(() => setSync(null));
    }, []),
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen options={{ title: 'Profile' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.intro, { color: t.muted }]}>
          Direct-edit sections per PRD v1.27 §4.8.4. Onboarding is first-time-only; individual fields are edited here with minimum-necessary computation per edit.
        </Text>

        {sync?.out_of_sync ? (
          <Pressable
            onPress={() => router.push('/settings/profile/regenerate')}
            style={({ pressed }) => [
              styles.nudge,
              {
                backgroundColor: 'rgba(255,176,46,0.12)',
                borderColor: '#F5A524',
                opacity: pressed ? 0.85 : 1,
              },
            ]}>
            <Ionicons name="sync-circle-outline" size={18} color={'#F5A524'} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.nudgeTitle, { color: t.text }]}>
                AI profile map is out of date
              </Text>
              <Text style={[styles.nudgeBody, { color: t.muted }]}>
                {sync.reason ?? 'Diet preferences changed.'} Regenerate to refresh the
                coaching context — uses 1 AI call.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={t.muted} />
          </Pressable>
        ) : null}

        <SettingsRow title="Body stats" hint="Height, weight, birthday, sex, body fat" onPress={() => router.push('/settings/profile/body-stats')} />
        <SettingsRow title="Daily life" hint="Occupation, work style, stress" onPress={() => router.push('/settings/profile/daily-life')} />
        <SettingsRow title="Diet preferences" hint="Flags for next AI profile regeneration" onPress={() => router.push('/settings/profile/diet')} />
        <SettingsRow title="Macro targets" hint="Deficit / macros / micros sliders" onPress={() => router.push('/settings/profile/macros')} />
        <SettingsRow title="Advanced" hint="Rollover, auto-adjust, RMR lock, water goal" onPress={() => router.push('/settings/profile/advanced')} />
        <SettingsRow title="Regenerate AI profile map" hint="Uses 1 AI call" onPress={() => router.push('/settings/profile/regenerate')} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 8, paddingBottom: 40 },
  intro: { fontSize: 12, lineHeight: 18, marginBottom: 8, fontStyle: 'italic' },
  nudge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 4,
  },
  nudgeTitle: { fontSize: 13, fontWeight: '700' },
  nudgeBody: { fontSize: 12, marginTop: 2, lineHeight: 16 },
});
