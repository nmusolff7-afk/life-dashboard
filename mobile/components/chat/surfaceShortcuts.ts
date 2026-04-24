import type { Href, Router } from 'expo-router';

import type { Shortcut } from './ChatShortcutRail';

interface Deps {
  router: Router;
  closeOverlay: () => void;
  expandedKey: string | null;
  setExpandedKey: (key: string | null) => void;
}

/** Same shortcut list on every screen per founder. Tapping "Log Meal"
 *  expands to the four ways to log a meal (Manual, Scan, Barcode,
 *  Saved), matching the Flask PWA pattern. Any other shortcut navigates
 *  directly. */
export function universalShortcuts(deps: Deps): Shortcut[] {
  const { router, closeOverlay, expandedKey, setExpandedKey } = deps;

  const goto = (href: Href) => {
    closeOverlay();
    router.push(href);
  };

  const hourNow = new Date().getHours();
  const mealHours =
    (hourNow >= 5 && hourNow < 10) ||
    (hourNow >= 11 && hourNow < 14) ||
    (hourNow >= 17 && hourNow < 21);

  // Meal-log sub-options, revealed when Log Meal is tapped. Short labels
  // so pills fit in the ~80pt narrow column over the FAB.
  if (expandedKey === 'log-meal') {
    return [
      {
        key: 'meal-manual',
        label: 'Manual',
        icon: 'create-outline',
        onPress: () => goto('/(tabs)/nutrition?open=manual'),
      },
      {
        key: 'meal-scan',
        label: 'Scan',
        icon: 'camera-outline',
        onPress: () => goto('/(tabs)/nutrition?open=scan'),
      },
      {
        key: 'meal-barcode',
        label: 'Barcode',
        icon: 'barcode-outline',
        onPress: () => goto('/(tabs)/nutrition?open=barcode'),
      },
      {
        key: 'meal-saved',
        label: 'Saved',
        icon: 'bookmark-outline',
        onPress: () => goto('/(tabs)/nutrition?open=saved'),
      },
      {
        key: 'meal-back',
        label: 'Back',
        icon: 'chevron-back-outline',
        onPress: () => setExpandedKey(null),
      },
    ];
  }

  return [
    {
      key: 'log-meal',
      label: 'Meal',
      icon: 'restaurant-outline',
      emphasized: mealHours,
      onPress: () => setExpandedKey('log-meal'),
    },
    {
      key: 'log-workout',
      label: 'Workout',
      icon: 'barbell-outline',
      onPress: () => goto('/(tabs)/fitness'),
    },
    {
      key: 'log-weight',
      label: 'Weight',
      icon: 'scale-outline',
      onPress: () => goto('/fitness/subsystem/body'),
    },
  ];
}
