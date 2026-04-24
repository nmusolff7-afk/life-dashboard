import { useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';
import type { ScrollView } from 'react-native';

/** Attaches a ScrollView ref + a manual `resetScroll()` callback AND
 *  auto-resets scroll to 0 every time the tab regains focus (per 11.5.10
 *  founder spec: "when switching between bottom tabs, the scroll
 *  position of the newly-opened tab is always 0").
 *
 *  This intentionally differs from earlier behaviour. Drilling into a
 *  subsystem detail and popping back does NOT fire useFocusEffect on
 *  the tab route (the tab stays focused while a stacked screen is
 *  presented over it), so scroll position is preserved for that case.
 *  Only cross-tab switches trigger the reset. */
export function useResetScrollOnFocus(): {
  ref: React.RefObject<ScrollView | null>;
  resetScroll: () => void;
} {
  const ref = useRef<ScrollView | null>(null);
  const resetScroll = useCallback(() => {
    ref.current?.scrollTo({ y: 0, animated: false });
  }, []);
  useFocusEffect(
    useCallback(() => {
      // Delay a tick so the reset fires AFTER any layout shifts from
      // the focus-time sub-tab reset (useFocusEffect in tab bodies that
      // flip sub-tab back to Today can change card heights).
      const id = setTimeout(() => {
        ref.current?.scrollTo({ y: 0, animated: false });
      }, 0);
      return () => clearTimeout(id);
    }, []),
  );
  return { ref, resetScroll };
}
