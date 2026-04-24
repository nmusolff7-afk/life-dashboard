import type { Href, Router } from 'expo-router';

import type { Surface } from '../../lib/useChatSession';
import type { Shortcut } from './ChatShortcutRail';

interface Deps {
  router: Router;
  closeOverlay: () => void;
}

/** Per-surface shortcut sets — PRD §4.7.5 + locked C4.
 *  The FAB gives the SAME chat+shortcuts experience on every surface.
 *  Only the shortcut list differs by context; the chat input is universal.
 *  Shortcuts open the existing native flow (NOT the chatbot) per §4.7.5.
 *
 *  Wired shortcuts only — anything that would route to an unbuilt surface
 *  (e.g. Finance Add Transaction) is omitted until that surface exists.
 *  Home always gets the cross-cutting shortcuts that work today. */
export function shortcutsForSurface(surface: Surface, deps: Deps): Shortcut[] {
  const { router, closeOverlay } = deps;

  const goto = (href: Href) => {
    closeOverlay();
    router.push(href);
  };

  const hourNow = new Date().getHours();
  const mealHours = (hourNow >= 5 && hourNow < 10) ||
                    (hourNow >= 11 && hourNow < 14) ||
                    (hourNow >= 17 && hourNow < 21);

  const LOG_MEAL: Shortcut = {
    key: 'log-meal',
    label: 'Log Meal',
    icon: 'restaurant-outline',
    emphasized: mealHours,
    onPress: () => goto('/(tabs)/nutrition'),
  };
  const LOG_WORKOUT: Shortcut = {
    key: 'log-workout',
    label: 'Log Workout',
    icon: 'barbell-outline',
    onPress: () => goto('/(tabs)/fitness'),
  };
  const LOG_WEIGHT: Shortcut = {
    key: 'log-weight',
    label: 'Log Weight',
    icon: 'scale-outline',
    onPress: () => goto('/fitness/subsystem/body'),
  };
  const SCAN_MEAL: Shortcut = {
    key: 'scan-meal',
    label: 'Scan Meal',
    icon: 'camera-outline',
    onPress: () => goto('/(tabs)/nutrition'),
  };
  const BARCODE: Shortcut = {
    key: 'barcode',
    label: 'Barcode',
    icon: 'barcode-outline',
    onPress: () => goto('/(tabs)/nutrition'),
  };
  const SAVED_MEALS: Shortcut = {
    key: 'saved',
    label: 'Saved Meals',
    icon: 'bookmark-outline',
    onPress: () => goto('/(tabs)/nutrition'),
  };

  switch (surface) {
    case 'home':
      return [LOG_MEAL, LOG_WORKOUT];
    case 'fitness':
      return [LOG_WORKOUT, LOG_WEIGHT];
    case 'nutrition':
      return [LOG_MEAL, SCAN_MEAL, BARCODE, SAVED_MEALS];
    case 'finance':
    case 'time':
      // No native logging flows wired for these surfaces yet — the chatbot
      // input still works for questions. When Finance/Time wire their
      // logging actions, add them here.
      return [LOG_MEAL, LOG_WORKOUT];
    case 'settings':
    default:
      return [LOG_MEAL, LOG_WORKOUT];
  }
}
