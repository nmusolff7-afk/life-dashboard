import { Stack } from 'expo-router';

import { useTokens } from '../../lib/theme';

export default function SettingsLayout() {
  const t = useTokens();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: t.bg },
        headerTintColor: t.text,
        headerShadowVisible: false,
      }}
    />
  );
}
