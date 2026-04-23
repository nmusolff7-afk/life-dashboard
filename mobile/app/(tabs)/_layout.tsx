import { useAuth } from '@clerk/clerk-expo';
import { Redirect, Tabs } from 'expo-router';
import { Text } from 'react-native';

import { useTokens } from '../../lib/theme';
import { useClerkBridge } from '../../lib/useClerkBridge';
import { useOnboardingStatus } from '../../lib/useOnboardingStatus';

function TabIcon({ label, color }: { label: string; color: string }) {
  return <Text style={{ fontSize: 22, color }}>{label}</Text>;
}

export default function TabLayout() {
  const { isLoaded, isSignedIn } = useAuth();
  const t = useTokens();
  useClerkBridge();
  const onboarding = useOnboardingStatus();

  if (!isLoaded) return null;
  if (!isSignedIn) return <Redirect href="/(auth)/sign-in" />;
  // Wait until we know onboarding state. Skeleton shows a blank dark screen.
  if (isSignedIn && onboarding === 'loading') return null;
  if (onboarding === 'incomplete') return <Redirect href="/(onboarding)/biometric" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: t.bg, borderTopColor: t.border },
        tabBarActiveTintColor: t.accent,
        tabBarInactiveTintColor: t.muted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', tabBarIcon: ({ color }) => <TabIcon label="⌂" color={color} /> }}
      />
      <Tabs.Screen
        name="fitness"
        options={{ title: 'Fitness', tabBarIcon: ({ color }) => <TabIcon label="◉" color={color} /> }}
      />
      <Tabs.Screen
        name="nutrition"
        options={{ title: 'Nutrition', tabBarIcon: ({ color }) => <TabIcon label="▣" color={color} /> }}
      />
      <Tabs.Screen
        name="finance"
        options={{ title: 'Finance', tabBarIcon: ({ color }) => <TabIcon label="$" color={color} /> }}
      />
      <Tabs.Screen
        name="time"
        options={{ title: 'Time', tabBarIcon: ({ color }) => <TabIcon label="◷" color={color} /> }}
      />
    </Tabs>
  );
}
