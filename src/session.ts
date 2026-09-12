/**
 * Where the refresh token lives between launches: the Keychain/Keystore on a
 * device, localStorage on web. Nothing else is persisted — the access token is
 * short-lived and re-derived on launch.
 */
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const KEY = 'rove.refresh_token';

export const session = {
  async get(): Promise<string | null> {
    try {
      if (Platform.OS === 'web') return globalThis.localStorage?.getItem(KEY) ?? null;
      return await SecureStore.getItemAsync(KEY);
    } catch {
      return null;
    }
  },
  async set(value: string | null): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        if (value) globalThis.localStorage?.setItem(KEY, value);
        else globalThis.localStorage?.removeItem(KEY);
        return;
      }
      if (value) await SecureStore.setItemAsync(KEY, value);
      else await SecureStore.deleteItemAsync(KEY);
    } catch {
      /* a device that refuses storage just means signing in again */
    }
  },
};
