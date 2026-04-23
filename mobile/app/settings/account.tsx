import { useAuth } from '@clerk/clerk-expo';
import { Stack, useRouter } from 'expo-router';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { SettingsRow } from '../../components/apex';
import { clearFlaskToken } from '../../lib/flaskToken';
import { useTokens } from '../../lib/theme';

export default function AccountSettings() {
  const t = useTokens();
  const router = useRouter();
  const { signOut } = useAuth();

  const handleSignOut = async () => {
    clearFlaskToken();
    await signOut();
    router.replace('/(auth)/sign-in');
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen options={{ title: 'Data & account' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <SettingsRow
          title="Export my data"
          hint="CSV (Core) / PDF (Pro) per PRD §4.11"
          onPress={() => Alert.alert('Skeleton', 'Export ships in a later phase.')}
        />
        <SettingsRow title="Sign out" onPress={handleSignOut} />
        <SettingsRow
          title="Delete account"
          hint="30-day grace period, recoverable via restore flow"
          destructive
          onPress={() => Alert.alert('Skeleton', 'Account deletion ships in a later phase.')}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({ content: { padding: 16, gap: 8, paddingBottom: 40 } });
