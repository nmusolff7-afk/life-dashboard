import AsyncStorage from '@react-native-async-storage/async-storage';

export type UnitSystem = 'imperial' | 'metric';
export type HapticsLevel = 'off' | 'subtle' | 'full';
/** PRD v1.27 ships English + Spanish at v1. Other languages unlock as
 *  translations are completed. */
export type LanguageCode = 'en' | 'es';

export interface Preferences {
  units: UnitSystem;
  haptics: HapticsLevel;
  language: LanguageCode;
  /** Hydration tracking is opt-in "silent default" per PRD §4.4.12.
   *  Off by default; toggled on in Settings → Preferences. */
  hydrationActive: boolean;
  /** Daily water goal in fl oz. FDA-adjacent default 64 (8×8). */
  hydrationGoalOz: number;
}

const KEY = 'apex.preferences';

export const DEFAULT_PREFERENCES: Preferences = {
  units: 'imperial',
  haptics: 'subtle',
  language: 'en',
  hydrationActive: false,
  hydrationGoalOz: 64,
};

/** Legacy-preference migration: the previous version allowed 10 languages.
 *  Anything outside {en, es} falls back to English on next load. Unset
 *  hydration fields inherit the DEFAULT_PREFERENCES values. */
function migrate(parsed: Partial<Preferences>): Preferences {
  const lang = parsed.language === 'en' || parsed.language === 'es' ? parsed.language : 'en';
  return { ...DEFAULT_PREFERENCES, ...parsed, language: lang };
}

export async function loadPreferences(): Promise<Preferences> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    return migrate(parsed);
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export async function savePreferences(prefs: Preferences): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(prefs));
}
