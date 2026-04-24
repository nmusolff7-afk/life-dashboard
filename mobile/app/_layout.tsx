import { ClerkProvider, useAuth } from '@clerk/clerk-expo';
import { DarkTheme, DefaultTheme, ThemeProvider as NavThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { StrengthTrackerModal } from '../components/apex';
import { ChatOverlay } from '../components/chat/ChatOverlay';
import { QuickLogHost } from '../components/chat/QuickLogHost';
import { hydrateFlaskToken } from '../lib/flaskToken';
import { useTodayWorkouts } from '../lib/hooks/useHomeData';
import { ThemeProvider, useTheme } from '../lib/theme';
import { tokenCache } from '../lib/tokenCache';
import { ChatSessionProvider, useChatSession } from '../lib/useChatSession';
import { useDailyReset } from '../lib/useDailyReset';
import { StrengthSessionProvider } from '../lib/useStrengthSession';

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
      {/* Strength + chat providers live at root so screens outside the
          (tabs) group (subsystem detail, day detail, settings…) can still
          call useStrengthSession / useChatSession without crashing. The
          modal hosts render at root too so "Start session" from any route
          pops the tracker. Day Detail uses its own Stack header title, so
          we hide the root header for that route (no more double back
          button). */}
      <StrengthSessionProvider>
        <ChatSessionProvider>
          <Stack screenOptions={{ contentStyle: { backgroundColor: tokens.bg } }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
            <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
            <Stack.Screen name="chatbot" options={{ presentation: 'modal', title: 'Ask Life Dashboard' }} />
            <Stack.Screen name="day/[date]" options={{ headerShown: false }} />
            <Stack.Screen name="goals" options={{ headerShown: false }} />
            <Stack.Screen name="settings" options={{ headerShown: false }} />
          </Stack>
          <SignedInHosts />
        </ChatSessionProvider>
      </StrengthSessionProvider>
      <StatusBar style={resolved === 'dark' ? 'light' : 'dark'} />
    </NavThemeProvider>
  );
}

/** Only mount the global overlay hosts once the user is signed in — their
 *  inner hooks fire authenticated fetches, which would 401 on auth
 *  screens otherwise. */
function SignedInHosts() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded || !isSignedIn) return null;
  return (
    <>
      <RootStrengthTrackerHost />
      <ChatOverlay />
      <QuickLogHost />
      <RootMidnightFlush />
    </>
  );
}

/** Global midnight-rollover guard. Bumps chat.dataVersion at local
 *  midnight so any mounted tab's data effects refetch — tabs that
 *  weren't focused at rollover will still refresh when they next render.
 *  Individual tabs also have their own useDailyReset; this is the
 *  belt-and-suspenders layer that catches cases like "user is on
 *  Settings at midnight" where no tab-level hook fires. */
function RootMidnightFlush() {
  const chat = useChatSession();
  useDailyReset(() => {
    chat.bumpDataVersion();
  });
  return null;
}

function RootStrengthTrackerHost() {
  const todayWorkouts = useTodayWorkouts();
  return <StrengthTrackerModal onLogged={() => todayWorkouts.refetch()} />;
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
    <SafeAreaProvider>
      <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
        <ThemeProvider>
          <ThemedStack />
        </ThemeProvider>
      </ClerkProvider>
    </SafeAreaProvider>
  );
}
