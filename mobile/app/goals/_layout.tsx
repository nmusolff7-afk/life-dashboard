import { Stack } from 'expo-router';

import { useTokens } from '../../lib/theme';

export default function GoalsLayout() {
  const t = useTokens();
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: t.bg },
        headerTintColor: t.text,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: t.bg },
      }}
    />
  );
}
