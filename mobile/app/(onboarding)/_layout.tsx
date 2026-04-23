import { useAuth } from '@clerk/clerk-expo';
import { Redirect, Stack } from 'expo-router';

import { useClerkBridge } from '../../lib/useClerkBridge';

export default function OnboardingLayout() {
  const { isLoaded, isSignedIn } = useAuth();
  useClerkBridge();

  if (!isLoaded) return null;
  if (!isSignedIn) return <Redirect href="/(auth)/sign-in" />;

  return <Stack screenOptions={{ headerShown: false, contentStyle: { padding: 0 } }} />;
}
