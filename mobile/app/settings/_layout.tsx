import { Stack } from 'expo-router';

import { useTokens } from '../../lib/theme';

export default function SettingsLayout() {
  const t = useTokens();
  // The nested `profile/_layout.tsx` Stack owns its own header — hide
  // this outer Stack's header for the `profile` route so we don't
  // render two stacked headers + two back buttons when navigating into
  // profile sub-screens.
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: t.bg },
        headerTintColor: t.text,
        headerShadowVisible: false,
      }}>
      <Stack.Screen name="profile" options={{ headerShown: false }} />
    </Stack>
  );
}
