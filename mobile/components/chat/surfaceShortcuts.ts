import type { Href, Router } from 'expo-router';

import type { Surface } from '../../lib/useChatSession';
import type { Shortcut } from './ChatShortcutRail';

interface Deps {
  router: Router;
  closeOverlay: () => void;
}

/** Locked C4 — CC's discretion on the per-surface shortcut set.
 *  Selected from PRD §4.7.5 scoped to Phase 4 (Home/Fitness/Nutrition
 *  only — Finance/Time deferred until their tabs wire data). Each
 *  shortcut opens the existing native flow: tapping "Log Meal" routes
 *  to Nutrition tab (which surfaces the LogMealCard) — it does NOT
 *  pre-fill the chat input per §4.7.5 "opens a native flow, not the
 *  chatbot". */
export function shortcutsForSurface(surface: Surface, deps: Deps): Shortcut[] {
  const { router, closeOverlay } = deps;

  const goto = (href: Href) => {
    closeOverlay();
    router.push(href);
  };

  const hourNow = new Date().getHours();
  // Time-of-day emphasis — most-useful shortcut gets thicker accent
  // border. Deterministic, zero-cost per §4.7.5.
  const mealHours = (hourNow >= 5 && hourNow < 10) ||
                    (hourNow >= 11 && hourNow < 14) ||
                    (hourNow >= 17 && hourNow < 21);

  switch (surface) {
    case 'home':
      return [
        {
          key: 'log-meal',
          label: 'Log Meal',
          icon: 'restaurant-outline',
          emphasized: mealHours,
          onPress: () => goto('/(tabs)/nutrition'),
        },
        {
          key: 'log-workout',
          label: 'Log Workout',
          icon: 'barbell-outline',
          onPress: () => goto('/(tabs)/fitness'),
        },
      ];
    case 'fitness':
      return [
        {
          key: 'log-workout',
          label: 'Log Workout',
          icon: 'barbell-outline',
          onPress: () => goto('/(tabs)/fitness'),
        },
        {
          key: 'log-weight',
          label: 'Log Weight',
          icon: 'scale-outline',
          onPress: () => goto('/settings/profile/body-stats'),
        },
        {
          key: 'log-freestyle',
          label: 'Freestyle',
          icon: 'flash-outline',
          onPress: () => goto('/(tabs)/fitness'),
        },
      ];
    case 'nutrition':
      return [
        {
          key: 'log-meal',
          label: 'Log Meal',
          icon: 'restaurant-outline',
          emphasized: mealHours,
          onPress: () => goto('/(tabs)/nutrition'),
        },
        {
          key: 'scan-meal',
          label: 'Scan Meal',
          icon: 'camera-outline',
          onPress: () => goto('/(tabs)/nutrition'),
        },
        {
          key: 'barcode',
          label: 'Barcode',
          icon: 'barcode-outline',
          onPress: () => goto('/(tabs)/nutrition'),
        },
        {
          key: 'saved',
          label: 'Saved',
          icon: 'bookmark-outline',
          onPress: () => goto('/(tabs)/nutrition'),
        },
      ];
    case 'finance':
    case 'time':
    case 'settings':
    default:
      // Only the chat input is offered when no native shortcuts apply
      // for this surface.
      return [];
  }
}
