import { Stack } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { DietForm } from '../../../components/apex';
import { useOnboardingData } from '../../../lib/hooks/useHomeData';
import { useTokens } from '../../../lib/theme';

export default function DietPrefs() {
  const t = useTokens();
  const onboarding = useOnboardingData();

  return (
    <View style={[styles.wrap, { backgroundColor: t.bg }]}>
      <Stack.Screen
        options={{
          title: 'Diet preferences',
          headerStyle: { backgroundColor: t.bg },
          headerTintColor: t.text,
          headerShadowVisible: false,
        }}
      />
      {onboarding.loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={t.accent} />
        </View>
      ) : onboarding.error && !onboarding.data ? (
        <View style={styles.center}>
          <Text style={[styles.errorText, { color: t.danger }]}>
            Couldn't load your profile.
          </Text>
        </View>
      ) : (
        <DietForm
          onboarding={onboarding.data}
          onSaved={onboarding.refetch}
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
