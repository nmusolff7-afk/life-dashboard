import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export const tokenCache =
  Platform.OS === 'web'
    ? undefined
    : {
        async getToken(key: string): Promise<string | null> {
          try {
            return await SecureStore.getItemAsync(key);
          } catch {
            return null;
          }
        },
        async saveToken(key: string, token: string): Promise<void> {
          try {
            await SecureStore.setItemAsync(key, token);
          } catch {
            // ignore — secure store may be unavailable (e.g. locked keychain)
          }
        },
      };
