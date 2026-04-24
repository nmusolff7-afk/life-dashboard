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
}

const KEY = 'apex.preferences';

export const DEFAULT_PREFERENCES: Preferences = {
  units: 'imperial',
  haptics: 'subtle',
  language: 'en',
};

/** Legacy-preference migration: the previous version allowed 10 languages.
 *  Anything outside {en, es} falls back to English on next load. */
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
