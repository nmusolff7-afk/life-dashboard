import { useAuth } from '@clerk/clerk-expo';
import { Redirect, Stack } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useClerkBridge } from '../../lib/useClerkBridge';
import { useTokens } from '../../lib/theme';

/** Onboarding stack — Stack.Screen has `headerShown: false` so each
 *  screen is a raw View. Wrapping the Stack with safe-area insets
 *  prevents content from bleeding into the status bar (top) or the
 *  gesture nav (bottom) on Android — founder flagged this in INBOX
 *  2026-04-28. */
export default function OnboardingLayout() {
  const { isLoaded, isSignedIn } = useAuth();
  const insets = useSafeAreaInsets();
  const t = useTokens();
  useClerkBridge();

  if (!isLoaded) return null;
  if (!isSignedIn) return <Redirect href="/(auth)/sign-in" />;

  return (
    <View
      style={{
        flex: 1,
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
        backgroundColor: t.bg,
      }}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { padding: 0 } }} />
    </View>
  );
}
