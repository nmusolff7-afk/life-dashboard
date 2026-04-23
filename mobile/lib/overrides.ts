import AsyncStorage from '@react-native-async-storage/async-storage';

/** Client-side RMR / NEAT / macro-target locks. Mirrors Flask's
 *  localStorage `rmr-locked` pattern. Persisted in AsyncStorage so other
 *  forms can check whether the user has manually overridden a computed
 *  value before replacing it with a fresh suggestion. */
export interface Overrides {
  rmrKcal?: number | null;
  rmrLocked: boolean;
  neatKcal?: number | null;
  neatLocked: boolean;
  macrosLocked: {
    protein: boolean;
    carbs: boolean;
    fat: boolean;
    sugar: boolean;
    fiber: boolean;
    sodium: boolean;
  };
}

const KEY = 'apex.overrides';

export const DEFAULT_OVERRIDES: Overrides = {
  rmrKcal: null,
  rmrLocked: false,
  neatKcal: null,
  neatLocked: false,
  macrosLocked: {
    protein: false,
    carbs: false,
    fat: false,
    sugar: false,
    fiber: false,
    sodium: false,
  },
};

export async function loadOverrides(): Promise<Overrides> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return DEFAULT_OVERRIDES;
    const parsed = JSON.parse(raw) as Partial<Overrides>;
    return {
      ...DEFAULT_OVERRIDES,
      ...parsed,
      macrosLocked: {
        ...DEFAULT_OVERRIDES.macrosLocked,
        ...(parsed.macrosLocked ?? {}),
      },
    };
  } catch {
    return DEFAULT_OVERRIDES;
  }
}

export async function saveOverrides(overrides: Overrides): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(overrides));
}

export async function clearOverrides(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
