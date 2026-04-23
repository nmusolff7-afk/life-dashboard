import AsyncStorage from '@react-native-async-storage/async-storage';

export type UnitSystem = 'imperial' | 'metric';
export type HapticsLevel = 'off' | 'subtle' | 'full';
export type LanguageCode = 'en' | 'es' | 'fr' | 'de' | 'pt' | 'it' | 'nl' | 'pl' | 'zh' | 'ar';

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

export async function loadPreferences(): Promise<Preferences> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    return { ...DEFAULT_PREFERENCES, ...parsed };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export async function savePreferences(prefs: Preferences): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(prefs));
}
