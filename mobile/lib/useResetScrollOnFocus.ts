import { useCallback, useRef } from 'react';
import type { ScrollView } from 'react-native';

/** Attaches a ScrollView ref + a manual `resetScroll()` callback. Scroll
 *  position is NOT auto-reset on focus — React Navigation preserves it
 *  natively for mounted screens, which is what the founder wants:
 *  navigating to a subsystem detail screen and back leaves the list
 *  exactly where it was. Sub-tab onChange handlers (Today/Progress/
 *  History) should still call resetScroll() so switching sub-tabs feels
 *  clean. */
export function useResetScrollOnFocus(): {
  ref: React.RefObject<ScrollView | null>;
  resetScroll: () => void;
} {
  const ref = useRef<ScrollView | null>(null);
  const resetScroll = useCallback(() => {
    ref.current?.scrollTo({ y: 0, animated: false });
  }, []);
  return { ref, resetScroll };
}
