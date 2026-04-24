import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Redirect, Tabs, router as rootRouter, useSegments } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenHeader, WorkoutActiveBanner } from '../../components/apex';
import { useProfile } from '../../lib/hooks/useHomeData';
import { useTokens } from '../../lib/theme';
import { useChatSession } from '../../lib/useChatSession';
import { useClerkBridge } from '../../lib/useClerkBridge';
import { useHaptics } from '../../lib/useHaptics';
import { useOnboardingStatus } from '../../lib/useOnboardingStatus';
import { useStrengthSession } from '../../lib/useStrengthSession';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const TAB_ICONS: Record<string, IconName> = {
  index: 'home-outline',
  fitness: 'barbell-outline',
  nutrition: 'restaurant-outline',
  finance: 'wallet-outline',
  time: 'time-outline',
};

/** Mirrors Flask's fixed bottom `<nav>` — 64px bar, #0D0D14 background,
 *  hairline top border, 2px accent pill above the active button. */
function FlaskTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const haptics = useHaptics();

  return (
    <View>
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

  return (
    <SwipeableTabs>
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
    </SwipeableTabs>
  );
}

/** Wraps the tab content in a horizontal pan gesture that flips
 *  between the 5 main tabs. Only fires when no overlay is open —
 *  FAB / QuickLog / Strength Tracker all veto the navigation so
 *  accidental swipes inside those UIs don't leave them dangling.
 *
 *  activeOffsetX / failOffsetY mean the gesture only wins when the
 *  user moves clearly horizontally (≥ 30pt) without any large
 *  vertical component first — so vertical ScrollViews inside tabs
 *  still scroll freely. */
const TAB_ORDER = ['index', 'fitness', 'nutrition', 'finance', 'time'] as const;

function SwipeableTabs({ children }: { children: React.ReactNode }) {
  const t = useTokens();
  const chat = useChatSession();
  const strength = useStrengthSession();
  const segments = useSegments();

  const swipe = Gesture.Pan()
    .activeOffsetX([-30, 30])
    .failOffsetY([-20, 20])
    .onEnd((e) => {
      // Block when any overlay is open — prevents accidental tab
      // swipes stealing focus from chat / modal / tracker.
      if (chat.visible || chat.quickLog || strength.modalVisible) return;
      if (segments[0] !== '(tabs)') return;

      const currentTab = (segments[1] as string | undefined) ?? 'index';
      const currentIdx = TAB_ORDER.indexOf(currentTab as typeof TAB_ORDER[number]);
      if (currentIdx < 0) return;

      const THRESHOLD = 60;
      const VELOCITY = 500;
      const fast = Math.abs(e.velocityX) > VELOCITY;
      const far = Math.abs(e.translationX) > THRESHOLD;
      if (!fast && !far) return;

      if (e.translationX < 0 && currentIdx < TAB_ORDER.length - 1) {
        // swipe left → next tab
        const next = TAB_ORDER[currentIdx + 1];
        rootRouter.navigate(`/(tabs)/${next === 'index' ? '' : next}` as never);
      } else if (e.translationX > 0 && currentIdx > 0) {
        // swipe right → previous tab
        const prev = TAB_ORDER[currentIdx - 1];
        rootRouter.navigate(`/(tabs)/${prev === 'index' ? '' : prev}` as never);
      }
    })
    .runOnJS(true);

  return (
    <GestureDetector gesture={swipe}>
      <View style={{ flex: 1, backgroundColor: t.bg }}>{children}</View>
    </GestureDetector>
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
