import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { dark, light, type ThemeName, type ThemeTokens } from '../../shared/src/design/tokens';

export type ThemePreference = 'system' | 'dark' | 'light';

const STORAGE_KEY = 'apex.theme.preference';

interface ThemeContextValue {
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
  resolved: ThemeName;
  tokens: ThemeTokens;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored === 'system' || stored === 'dark' || stored === 'light') {
          setPreferenceState(stored);
        }
      })
      .catch(() => {})
      .finally(() => setHydrated(true));
  }, []);

  const setPreference = (p: ThemePreference) => {
    setPreferenceState(p);
    AsyncStorage.setItem(STORAGE_KEY, p).catch(() => {});
  };

  const resolved: ThemeName =
    preference === 'system' ? (systemScheme === 'light' ? 'light' : 'dark') : preference;
  const tokens = resolved === 'light' ? light : dark;

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, setPreference, resolved, tokens }),
    [preference, resolved, tokens],
  );

  // Avoid flash: render children only after hydration. Return null briefly on cold start.
  if (!hydrated) return null;
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}

/** Convenience: tokens for the current theme, no preference/setter. */
export function useTokens(): ThemeTokens {
  return useTheme().tokens;
}
