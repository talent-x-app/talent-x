/**
 * Stockage sécurisé des jetons de session (TLX-009). iOS/Android : trousseau de
 * l'OS (Keychain / Keystore, TX-ARCH-001 §6.1) ; web : repli localStorage — via
 * l'adaptateur `secure-storage` (branché par plateforme).
 *
 * Un cache mémoire évite un accès trousseau (asynchrone) à chaque requête : il
 * est hydraté au démarrage (`loadTokens`) puis tenu à jour par set/clear.
 */
import { secureDelete, secureGet, secureSet } from './secure-storage';

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

const ACCESS_KEY = 'talentx.accessToken';
const REFRESH_KEY = 'talentx.refreshToken';

let cache: SessionTokens | null = null;

/** Hydrate le cache mémoire depuis le stockage. À appeler au démarrage. */
export async function loadTokens(): Promise<SessionTokens | null> {
  const [accessToken, refreshToken] = await Promise.all([
    secureGet(ACCESS_KEY),
    secureGet(REFRESH_KEY),
  ]);
  cache = accessToken && refreshToken ? { accessToken, refreshToken } : null;
  return cache;
}

/** Jetons en cache (synchrone). `null` si aucune session active. */
export function getTokens(): SessionTokens | null {
  return cache;
}

/** Persiste les jetons (stockage + cache). */
export async function setTokens(tokens: SessionTokens): Promise<void> {
  cache = tokens;
  await Promise.all([
    secureSet(ACCESS_KEY, tokens.accessToken),
    secureSet(REFRESH_KEY, tokens.refreshToken),
  ]);
}

/** Efface les jetons (stockage + cache) — déconnexion. */
export async function clearTokens(): Promise<void> {
  cache = null;
  await Promise.all([secureDelete(ACCESS_KEY), secureDelete(REFRESH_KEY)]);
}
