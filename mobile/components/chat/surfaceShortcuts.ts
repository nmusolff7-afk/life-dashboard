import type { QuickLog } from '../../lib/useChatSession';
import type { Shortcut } from './ChatShortcutRail';

interface Deps {
  expandedKey: string | null;
  setExpandedKey: (key: string | null) => void;
  openQuickLog: (kind: QuickLog) => void;
  /** Optional navigation hook — for shortcuts that route to a real
   *  screen (e.g. Task → /time/task-new) instead of popping a
   *  floating modal. Pass `router.push` from expo-router. */
  navigate?: (route: string) => void;
}

/** Universal FAB shortcut rail. Tapping Meal or Workout expands into
 *  sub-options (Manual / … / Back); every leaf fires openQuickLog, which
 *  closes the overlay and pops the matching floating entry modal
 *  (see QuickLogHost). Task is a navigation, not a quick-log modal —
 *  routes to the existing task-new screen. */
export function universalShortcuts(deps: Deps): Shortcut[] {
  const { expandedKey, setExpandedKey, openQuickLog, navigate } = deps;

  const fire = (kind: QuickLog) => () => openQuickLog(kind);

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
    // INBOX 2026-04-28: founder asked for a Task shortcut on the
    // FAB. Routes to the existing task-new screen rather than a
    // floating modal — matches the simpler Settings → Profile flow
    // pattern. Hidden when navigate isn't available (theoretical;
    // ChatOverlay always passes it).
    ...(navigate ? [{
      key: 'log-task' as const,
      label: 'Task',
      icon: 'checkbox-outline' as const,
      onPress: () => navigate('/time/task-new'),
    }] : []),
  ];
}
