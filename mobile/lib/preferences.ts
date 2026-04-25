import AsyncStorage from '@react-native-async-storage/async-storage';

export type UnitSystem = 'imperial' | 'metric';
export type HapticsLevel = 'off' | 'subtle' | 'full';
/** PRD v1.27 ships English + Spanish at v1. Other languages unlock as
 *  translations are completed. */
export type LanguageCode = 'en' | 'es';
export type TimezoneMode = 'automatic' | 'manual';

export interface Preferences {
  units: UnitSystem;
  haptics: HapticsLevel;
  language: LanguageCode;
  /** Hydration tracking per PRD §4.4.12. Default ON per founder. */
  hydrationActive: boolean;
  /** Daily water goal in fl oz. FDA-adjacent default 64 (8×8). */
  hydrationGoalOz: number;
  /** Calorie rollover per PRD §4.4.10 — surplus/deficit from yesterday
   *  folds into today's target. UI-layer toggle for v1; full server-
   *  side math lands in a later polish pass. */
  calorieRollover: boolean;
  /** Auto-adjust targets per PRD §4.4.10 — macro/calorie targets shift
   *  based on 7-day trailing behavior. Same UI-layer status as rollover
   *  at v1. */
  autoAdjustTargets: boolean;
  /** Lock the stored RMR so body-stat edits don't recompute it (user
   *  manually tuned it). */
  rmrLocked: boolean;
  /** Per PRD §4.8.9: Automatic follows device TZ; Manual pins an IANA
   *  zone for users whose device TZ lies (travel, VPN). */
  timezoneMode: TimezoneMode;
  /** IANA zone (e.g. "America/Los_Angeles"). Only used when
   *  timezoneMode === 'manual'. */
  timezoneManual: string;
}

const KEY = 'apex.preferences';

export const DEFAULT_PREFERENCES: Preferences = {
  units: 'imperial',
  haptics: 'subtle',
  language: 'en',
  hydrationActive: true,
  hydrationGoalOz: 64,
  calorieRollover: false,
  autoAdjustTargets: false,
  rmrLocked: false,
  timezoneMode: 'automatic',
  timezoneManual: '',
};

/** Legacy-preference migration: the previous version allowed 10 languages.
 *  Anything outside {en, es} falls back to English on next load. Unset
 *  hydration/timezone fields inherit the DEFAULT_PREFERENCES values. */
function migrate(parsed: Partial<Preferences>): Preferences {
  const lang = parsed.language === 'en' || parsed.language === 'es' ? parsed.language : 'en';
  const tzMode = parsed.timezoneMode === 'manual' ? 'manual' : 'automatic';
  return {
    ...DEFAULT_PREFERENCES,
    ...parsed,
    language: lang,
    timezoneMode: tzMode,
    timezoneManual: parsed.timezoneManual ?? DEFAULT_PREFERENCES.timezoneManual,
  };
}

/** Resolved IANA timezone at call time. Prefers the manual override when
 *  mode=manual AND a non-empty zone is set; otherwise reads device TZ via
 *  Intl.DateTimeFormat. Never throws — defaults to 'UTC' as a last resort. */
export function resolveTimezone(prefs: Preferences): string {
  if (prefs.timezoneMode === 'manual' && prefs.timezoneManual.trim()) {
    return prefs.timezoneManual.trim();
  }
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
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
