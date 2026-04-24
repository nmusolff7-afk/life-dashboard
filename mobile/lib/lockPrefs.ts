import AsyncStorage from '@react-native-async-storage/async-storage';

export interface LockPrefs {
  /** Require biometric unlock (Face ID / Touch ID / fingerprint) on launch. */
  biometricLock: boolean;
  /** App-lock the whole surface after backgrounding. When biometricLock is
   *  also on, this triggers a biometric prompt on re-foreground. */
  appLock: boolean;
}

const KEY = 'apex.locks';

export const DEFAULT_LOCKS: LockPrefs = {
  biometricLock: false,
  appLock: false,
};

export async function loadLockPrefs(): Promise<LockPrefs> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return DEFAULT_LOCKS;
    const parsed = JSON.parse(raw) as Partial<LockPrefs>;
    return { ...DEFAULT_LOCKS, ...parsed };
  } catch {
    return DEFAULT_LOCKS;
  }
}

export async function saveLockPrefs(prefs: LockPrefs): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(prefs));
}
