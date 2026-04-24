import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useState } from 'react';

import { DEFAULT_PREFERENCES, loadPreferences, type HapticsLevel } from './preferences';

type HapticIntent = 'tap' | 'toggle' | 'success' | 'warning' | 'error';

interface UseHapticsResult {
  level: HapticsLevel;
  fire: (intent: HapticIntent) => void;
}

/** Reads the user's haptics preference from AsyncStorage and hands back a
 *  `fire(intent)` helper. Off → no-op, Subtle → only critical intents,
 *  Full → every tap / toggle / outcome fires native haptic feedback. */
export function useHaptics(): UseHapticsResult {
  const [level, setLevel] = useState<HapticsLevel>(DEFAULT_PREFERENCES.haptics);

  useEffect(() => {
    loadPreferences().then((p) => setLevel(p.haptics)).catch(() => {});
  }, []);

  const fire = useCallback(
    (intent: HapticIntent) => {
      if (level === 'off') return;
      // Subtle: only success / warning / error (not every small tap).
      const shouldFireOnSubtle =
        intent === 'success' || intent === 'warning' || intent === 'error';
      if (level === 'subtle' && !shouldFireOnSubtle) return;
      try {
        switch (intent) {
          case 'tap':
            Haptics.selectionAsync();
            break;
          case 'toggle':
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            break;
          case 'success':
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            break;
          case 'warning':
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            break;
          case 'error':
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            break;
        }
      } catch {
        // Haptics may not be supported on every device; fail silently.
      }
    },
    [level],
  );

  return { level, fire };
}
