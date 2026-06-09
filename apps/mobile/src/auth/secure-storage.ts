/**
 * Adaptateur de stockage persistant, branché par plateforme (TLX-009).
 *
 * iOS/Android (cibles principales — TX-ARCH-001 §6.1) : trousseau de l'OS via
 * expo-secure-store (Keychain / Keystore), chiffré. **Web** (plateforme déclarée
 * dans app.json) : expo-secure-store n'a pas d'implémentation native → repli sur
 * `localStorage` (meilleur effort du navigateur, non chiffré ; acceptable en
 * dev/PWA, à durcir si le web devient une cible de production).
 */
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const isWeb = Platform.OS === 'web';

export async function secureGet(key: string): Promise<string | null> {
  if (isWeb) {
    return globalThis.localStorage?.getItem(key) ?? null;
  }
  return SecureStore.getItemAsync(key);
}

export async function secureSet(key: string, value: string): Promise<void> {
  if (isWeb) {
    globalThis.localStorage?.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function secureDelete(key: string): Promise<void> {
  if (isWeb) {
    globalThis.localStorage?.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}
