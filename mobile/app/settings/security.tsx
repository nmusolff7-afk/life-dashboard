import { Stack } from 'expo-router';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { SettingsRow } from '../../components/apex';
import { useTokens } from '../../lib/theme';

export default function Security() {
  const t = useTokens();
  const stub = (feature: string) => () =>
    Alert.alert('Skeleton', `${feature} ships in a later phase.`);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen options={{ title: 'Security' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <SettingsRow title="Biometric unlock" hint="Face ID / Touch ID / fingerprint" onPress={stub('Biometric unlock')} />
        <SettingsRow title="App Lock" hint="Require authentication on open" onPress={stub('App Lock')} />
        <SettingsRow title="Change password" hint="Opens Clerk flow" onPress={stub('Change password')} />
        <SettingsRow title="Sign out of all other devices" onPress={stub('Sign out all devices')} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({ content: { padding: 16, gap: 8, paddingBottom: 40 } });
