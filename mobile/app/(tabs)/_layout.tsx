import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Redirect, Tabs } from 'expo-router';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenHeader, WorkoutActiveBanner } from '../../components/apex';
import { ChatDock } from '../../components/chat/ChatDock';
import { useProfile } from '../../lib/hooks/useHomeData';
import { useTokens } from '../../lib/theme';
import type { Surface } from '../../lib/useChatSession';
import { useClerkBridge } from '../../lib/useClerkBridge';
import { useHaptics } from '../../lib/useHaptics';
import { useOnboardingStatus } from '../../lib/useOnboardingStatus';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const TAB_ICONS: Record<string, IconName> = {
  index: 'home-outline',
  fitness: 'barbell-outline',
  nutrition: 'restaurant-outline',
  finance: 'wallet-outline',
  time: 'time-outline',
};

/** Maps the current route name onto a chat Surface so ChatDock can
 *  forward the right container-context label to the chatbot. */
const SURFACE_FOR_ROUTE: Record<string, Surface> = {
  index: 'home',
  fitness: 'fitness',
  nutrition: 'nutrition',
  finance: 'finance',
  time: 'time',
};

/** Mirrors Flask's fixed bottom `<nav>` — 64px bar, #0D0D14 background,
 *  hairline top border, 2px accent pill above the active button.
 *
 *  The ChatDock is rendered INSIDE this component (above the nav row)
 *  so the "Ask anything" bar reads as an inline continuation of the
 *  bottom chrome, not a floating pill above it. KeyboardAvoidingView
 *  wraps the whole stack in TabLayout so the dock + tab bar rise with
 *  the keyboard. */
function FlaskTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const haptics = useHaptics();
  const currentRouteName = state.routes[state.index]?.name ?? 'index';
  const surface = SURFACE_FOR_ROUTE[currentRouteName] ?? 'home';

  return (
    <View>
      <ChatDock surface={surface} />
      <View
        style={[
          styles.bar,
          {
            backgroundColor: '#0D0D14',
            borderTopColor: 'rgba(255,255,255,0.03)',
            paddingBottom: insets.bottom,
            height: 64 + insets.bottom,
          },
        ]}>
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const { options } = descriptors[route.key];
          const label =
            typeof options.tabBarLabel === 'string'
              ? options.tabBarLabel
              : options.title ?? route.name;
          const iconName = TAB_ICONS[route.name] ?? 'ellipse-outline';
          const color = focused ? t.accent : t.subtle;

          const onPress = () => {
            haptics.fire('tap');
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
          };
          const onLongPress = () => {
            navigation.emit({ type: 'tabLongPress', target: route.key });
          };

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel}
              onPress={onPress}
              onLongPress={onLongPress}
              style={styles.btn}>
              {focused ? <View style={[styles.pill, { backgroundColor: t.accent }]} /> : null}
              <Ionicons name={iconName} size={22} color={color} />
              <Text style={[styles.label, { color, fontWeight: focused ? '600' : '400' }]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function TabLayout() {
  const { isLoaded, isSignedIn } = useAuth();
  const t = useTokens();
  useClerkBridge();
  const onboarding = useOnboardingStatus();
  const profile = useProfile();

  if (!isLoaded) return null;
  if (!isSignedIn) return <Redirect href="/(auth)/sign-in" />;

  if (onboarding === 'loading') {
    return (
      <View style={[styles.loading, { backgroundColor: t.bg }]}>
        <ActivityIndicator size="large" color={t.accent} />
        <Text style={[styles.loadingText, { color: t.muted }]}>Checking account…</Text>
      </View>
    );
  }

  if (onboarding === 'incomplete') return <Redirect href="/(onboarding)/biometric" />;

  const firstName = profile.data?.first_name?.trim();
  const headerTitle = firstName ? `${firstName}'s Dashboard` : 'Your Dashboard';

  // KeyboardAvoidingView wraps the whole tabs stack so when a text input
  // inside any tab's content opens the keyboard, the bottom chrome
  // (ChatDock + FlaskTabBar) rises with it. iOS uses 'padding' for the
  // smoothest lift; Android handles it natively via windowSoftInputMode
  // so we pass undefined there to avoid double-adjusting.
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: t.bg }}>
      <ScreenHeader title={headerTitle} />
      <WorkoutActiveBanner />
      <Tabs
        screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: t.bg } }}
        tabBar={(props) => <FlaskTabBar {...props} />}>
        <Tabs.Screen name="index" options={{ title: 'Home' }} />
        <Tabs.Screen name="fitness" options={{ title: 'Fitness' }} />
        <Tabs.Screen name="nutrition" options={{ title: 'Nutrition' }} />
        <Tabs.Screen name="finance" options={{ title: 'Finance' }} />
        <Tabs.Screen name="time" options={{ title: 'Time' }} />
      </Tabs>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: 1,
  },
  btn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    position: 'relative',
  },
  pill: {
    position: 'absolute',
    top: 0,
    width: '60%',
    height: 2,
    borderRadius: 100,
  },
  label: { fontSize: 11 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 13 },
});
