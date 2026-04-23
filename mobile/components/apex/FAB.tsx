import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTokens } from '../../lib/theme';

interface Props {
  /** Where the menu should open from. Currently only affects analytics hints. */
  from?: 'home' | 'fitness' | 'nutrition' | 'finance' | 'time';
}

/** Mirrors Flask #fab + #fab-menu: 52px accent circle above the bottom nav;
 *  tap rotates the "+" 45° (→ "×") and reveals Log a Meal / Log Activity
 *  pill buttons with a dimmed backdrop. */
export function FAB({ from = 'home' }: Props) {
  const t = useTokens();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: open ? 1 : 0,
      duration: 180,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [open, anim]);

  const rotate = anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] });
  const optionTranslate = anim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] });

  const toggle = () => setOpen((v) => !v);
  const openMeal = () => {
    setOpen(false);
    router.push({ pathname: '/chatbot', params: { from, prefill: 'I just ate: ' } });
  };
  const openActivity = () => {
    setOpen(false);
    router.push({ pathname: '/chatbot', params: { from, prefill: 'I just did: ' } });
  };

  const bottomBase = 64 + insets.bottom + 14; // above the 64px bottom nav

  return (
    <>
      {open ? (
        <Pressable
          onPress={toggle}
          accessibilityLabel="Close menu"
          style={[StyleSheet.absoluteFill, styles.backdrop]}
        />
      ) : null}

      {open ? (
        <Animated.View
          pointerEvents={open ? 'auto' : 'none'}
          style={[
            styles.menu,
            { bottom: bottomBase + 62, opacity: anim, transform: [{ translateY: optionTranslate }] },
          ]}>
          <FabOption
            label="Log a Meal"
            icon="restaurant-outline"
            bg={t.surface}
            text={t.text}
            onPress={openMeal}
          />
          <FabOption
            label="Log Activity"
            icon="barbell-outline"
            bg={t.surface}
            text={t.text}
            onPress={openActivity}
          />
        </Animated.View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={open ? 'Close quick actions' : 'Open quick actions'}
        onPress={toggle}
        style={({ pressed }) => [
          styles.fab,
          {
            backgroundColor: t.accent,
            bottom: bottomBase,
            transform: [{ scale: pressed ? 0.92 : 1 }],
            shadowColor: '#000',
          },
        ]}>
        <Animated.View style={{ transform: [{ rotate }] }}>
          <Ionicons name="add" size={30} color="#fff" />
        </Animated.View>
      </Pressable>
    </>
  );
}

function FabOption({
  label,
  icon,
  bg,
  text,
  onPress,
}: {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  bg: string;
  text: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        {
          backgroundColor: bg,
          transform: [{ scale: pressed ? 0.95 : 1 }],
          shadowColor: '#000',
        },
      ]}>
      <Ionicons name={icon} size={20} color={text} />
      <Text style={[styles.optionLabel, { color: text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 18,
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 110,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 6,
  },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 108 },
  menu: {
    position: 'absolute',
    right: 18,
    zIndex: 109,
    alignItems: 'flex-end',
    gap: 8,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 100,
    paddingVertical: 10,
    paddingHorizontal: 16,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 4,
  },
  optionLabel: { fontSize: 14, fontWeight: '600' },
});
