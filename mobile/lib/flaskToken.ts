import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const KEY = 'flask_jwt';

let flaskToken: string | null = null;

export function setFlaskToken(token: string): void {
  flaskToken = token;
  if (Platform.OS !== 'web') {
    SecureStore.setItemAsync(KEY, token).catch(() => {
      // secure store unavailable — in-memory copy still works for this session
    });
  }
}

export function getFlaskToken(): string | null {
  return flaskToken;
}

export function clearFlaskToken(): void {
  flaskToken = null;
  if (Platform.OS !== 'web') {
    SecureStore.deleteItemAsync(KEY).catch(() => {});
  }
}

export async function hydrateFlaskToken(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const stored = await SecureStore.getItemAsync(KEY);
    if (stored) flaskToken = stored;
  } catch {
    // secure store unavailable — leave flaskToken null, bridge will re-mint
  }
}
