import type { QuickLog } from '../../lib/useChatSession';
import type { Shortcut } from './ChatShortcutRail';

interface Deps {
  expandedKey: string | null;
  setExpandedKey: (key: string | null) => void;
  openQuickLog: (kind: QuickLog) => void;
}

/** Universal FAB shortcut rail. Tapping Meal or Workout expands into
 *  sub-options (Manual / … / Back); every leaf fires openQuickLog, which
 *  closes the overlay and pops the matching floating entry modal
 *  (see QuickLogHost). No tab navigation — entry lives over the current
 *  screen so the user never loses context. */
export function universalShortcuts(deps: Deps): Shortcut[] {
  const { expandedKey, setExpandedKey, openQuickLog } = deps;

  const fire = (kind: QuickLog) => () => openQuickLog(kind);

  const hourNow = new Date().getHours();
  const mealHours =
    (hourNow >= 5 && hourNow < 10) ||
    (hourNow >= 11 && hourNow < 14) ||
    (hourNow >= 17 && hourNow < 21);

  if (expandedKey === 'log-meal') {
    return [
      { key: 'meal-manual',  label: 'Manual',  icon: 'create-outline',        onPress: fire('meal-manual') },
      { key: 'meal-scan',    label: 'Scan',    icon: 'camera-outline',        onPress: fire('meal-scan') },
      { key: 'meal-barcode', label: 'Barcode', icon: 'barcode-outline',       onPress: fire('meal-barcode') },
      { key: 'meal-saved',   label: 'Saved',   icon: 'bookmark-outline',      onPress: fire('meal-saved') },
      { key: 'meal-back',    label: 'Back',    icon: 'chevron-back-outline',  onPress: () => setExpandedKey(null) },
    ];
  }

  if (expandedKey === 'log-workout') {
    return [
      { key: 'workout-manual',   label: 'Manual',   icon: 'create-outline',       onPress: fire('workout-manual') },
      { key: 'workout-strength', label: 'Strength', icon: 'barbell-outline',      onPress: fire('workout-strength') },
      { key: 'workout-cardio',   label: 'Cardio',   icon: 'walk-outline',         onPress: fire('workout-cardio') },
      { key: 'workout-saved',    label: 'Saved',    icon: 'bookmark-outline',     onPress: fire('workout-saved') },
      { key: 'workout-back',     label: 'Back',     icon: 'chevron-back-outline', onPress: () => setExpandedKey(null) },
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
      onPress: () => setExpandedKey('log-workout'),
    },
    {
      key: 'log-weight',
      label: 'Weight',
      icon: 'scale-outline',
      onPress: fire('weight'),
    },
  ];
}
