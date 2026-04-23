import { ClerkProvider } from '@clerk/clerk-expo';
import { DarkTheme, DefaultTheme, ThemeProvider as NavThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import 'react-native-reanimated';

import { hydrateFlaskToken } from '../lib/flaskToken';
import { ThemeProvider, useTheme } from '../lib/theme';
import { tokenCache } from '../lib/tokenCache';

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

export const unstable_settings = {
  anchor: '(tabs)',
};

function ThemedStack() {
  const { resolved, tokens } = useTheme();
  const navTheme = resolved === 'dark'
    ? { ...DarkTheme, colors: { ...DarkTheme.colors, background: tokens.bg, card: tokens.surface, text: tokens.text, border: tokens.border, primary: tokens.accent } }
    : { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: tokens.bg, card: tokens.surface, text: tokens.text, border: tokens.border, primary: tokens.accent } };

  return (
    <NavThemeProvider value={navTheme}>
      <Stack screenOptions={{ contentStyle: { backgroundColor: tokens.bg } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
        <Stack.Screen name="chatbot" options={{ presentation: 'modal', title: 'Ask Life Dashboard' }} />
        <Stack.Screen name="day/[date]" options={{ title: '' }} />
        <Stack.Screen name="goals" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style={resolved === 'dark' ? 'light' : 'dark'} />
    </NavThemeProvider>
  );
}

export default function RootLayout() {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    hydrateFlaskToken().finally(() => setHydrated(true));
  }, []);

  if (!publishableKey) {
    throw new Error(
      'EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is not set. Add it to mobile/.env.',
    );
  }

  if (!hydrated) return null;

  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <ThemeProvider>
        <ThemedStack />
      </ThemeProvider>
    </ClerkProvider>
  );
}
