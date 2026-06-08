/**
 * Stockage sécurisé des jetons de session (TLX-009).
 * Les jetons sont conservés dans le trousseau de l'OS via expo-secure-store
 * (Keychain iOS / Keystore Android), conformément à TX-ARCH-001 §6.1 — jamais
 * en clair ni dans un stockage non chiffré.
 *
 * Un cache mémoire évite un accès trousseau (asynchrone) à chaque requête : il
 * est hydraté au démarrage (`loadTokens`) puis tenu à jour par set/clear.
 */
import * as SecureStore from 'expo-secure-store';

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

const ACCESS_KEY = 'talentx.accessToken';
const REFRESH_KEY = 'talentx.refreshToken';

let cache: SessionTokens | null = null;

/** Hydrate le cache mémoire depuis le trousseau. À appeler au démarrage. */
export async function loadTokens(): Promise<SessionTokens | null> {
  const [accessToken, refreshToken] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_KEY),
    SecureStore.getItemAsync(REFRESH_KEY),
  ]);
  cache = accessToken && refreshToken ? { accessToken, refreshToken } : null;
  return cache;
}

/** Jetons en cache (synchrone). `null` si aucune session active. */
export function getTokens(): SessionTokens | null {
  return cache;
}

/** Persiste les jetons (trousseau + cache). */
export async function setTokens(tokens: SessionTokens): Promise<void> {
  cache = tokens;
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_KEY, tokens.accessToken),
    SecureStore.setItemAsync(REFRESH_KEY, tokens.refreshToken),
  ]);
}

/** Efface les jetons (trousseau + cache) — déconnexion. */
export async function clearTokens(): Promise<void> {
  cache = null;
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_KEY),
    SecureStore.deleteItemAsync(REFRESH_KEY),
  ]);
}
