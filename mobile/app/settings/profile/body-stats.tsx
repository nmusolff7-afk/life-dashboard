import { Stack } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { BodyStatsForm } from '../../../components/apex';
import { useOnboardingData, useProfile } from '../../../lib/hooks/useHomeData';
import { useTokens } from '../../../lib/theme';

export default function BodyStats() {
  const t = useTokens();
  const profile = useProfile();
  const onboarding = useOnboardingData();

  const loading = profile.loading && onboarding.loading;
  const error = profile.error && onboarding.error;

  const refetch = async () => {
    await Promise.all([profile.refetch(), onboarding.refetch()]);
  };

  return (
    <View style={[styles.wrap, { backgroundColor: t.bg }]}>
      <Stack.Screen
        options={{
          title: 'Body stats',
          headerStyle: { backgroundColor: t.bg },
          headerTintColor: t.text,
          headerShadowVisible: false,
        }}
      />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={t.accent} />
        </View>
      ) : error && !onboarding.data && !profile.data ? (
        <View style={styles.center}>
          <Text style={[styles.errorText, { color: t.danger }]}>
            Couldn't load your profile. Pull to retry on the main screen.
          </Text>
        </View>
      ) : (
        <BodyStatsForm
          onboarding={onboarding.data}
          profile={profile.data}
          onSaved={refetch}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  errorText: { fontSize: 14, textAlign: 'center' },
});
