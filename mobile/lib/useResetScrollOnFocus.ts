import { useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';
import type { ScrollView } from 'react-native';

/** Ties a ScrollView ref to "scroll to top whenever this screen gains focus".
 *  Covers the bottom-tab switch case — when the user leaves and returns to a
 *  tab, it starts at the top rather than where they left off. Attach the
 *  returned ref to the screen's ScrollView and call `resetScroll()` from
 *  sub-tab onChange handlers to cover in-screen tab switches too. */
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
      resetScroll();
    }, [resetScroll]),
  );

  return { ref, resetScroll };
}
