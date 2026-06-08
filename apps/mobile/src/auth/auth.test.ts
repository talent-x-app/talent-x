import { getAuthHeaders, refreshAuth, restoreSession } from './auth';
import { clearRole, getRole, loadRole, setRole } from './session-store';
import { clearTokens, getTokens, loadTokens, setTokens } from './token-store';

// URL de base fixe (pas de dépendance à l'environnement Expo en test).
jest.mock('../config/env', () => ({ apiBaseUrl: 'https://api.test/api/v1' }));

// Trousseau en mémoire.
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    __store: store,
    getItemAsync: jest.fn(async (k: string) => store.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => void store.set(k, v)),
    deleteItemAsync: jest.fn(async (k: string) => void store.delete(k)),
  };
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const fetchMock = jest.fn();

describe('auth (intercepteur d’authentification)', () => {
  beforeEach(async () => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
    await loadTokens();
    await setTokens({ accessToken: 'old-access', refreshToken: 'old-refresh' });
  });

  describe('getAuthHeaders', () => {
    it('renvoie le Bearer du token d’accès courant', () => {
      expect(getAuthHeaders()).toEqual({ Authorization: 'Bearer old-access' });
    });
  });

  describe('refreshAuth', () => {
    it('rafraîchit la session et stocke les nouveaux jetons (rotation)', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ accessToken: 'new-access', refreshToken: 'new-refresh', expiresIn: 900 }),
      );

      const ok = await refreshAuth();

      expect(ok).toBe(true);
      expect(getTokens()).toEqual({ accessToken: 'new-access', refreshToken: 'new-refresh' });
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.test/api/v1/auth/refresh');
      expect(JSON.parse(init.body)).toEqual({ refreshToken: 'old-refresh' });
    });

    it('est single-flight : des appels concurrents partagent un seul refresh', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ accessToken: 'new-access', refreshToken: 'new-refresh', expiresIn: 900 }),
      );

      const [a, b] = await Promise.all([refreshAuth(), refreshAuth()]);

      expect(a).toBe(true);
      expect(b).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('déconnecte sur 409 (réutilisation de refresh détectée)', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ error: 'TOKEN_REUSE_DETECTED' }, 409));

      const ok = await refreshAuth();

      expect(ok).toBe(false);
      expect(getTokens()).toBeNull();
    });

    it('déconnecte sur 401 (refresh invalide/expiré)', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ error: 'UNAUTHORIZED' }, 401));

      const ok = await refreshAuth();

      expect(ok).toBe(false);
      expect(getTokens()).toBeNull();
    });

    it('conserve la session sur erreur réseau (reprise possible)', async () => {
      fetchMock.mockRejectedValue(new Error('network down'));

      const ok = await refreshAuth();

      expect(ok).toBe(false);
      expect(getTokens()).toEqual({ accessToken: 'old-access', refreshToken: 'old-refresh' });
    });

    it('renvoie false sans session active', async () => {
      await clearTokens();

      expect(await refreshAuth()).toBe(false);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('restoreSession (persistance + refresh silencieux)', () => {
    beforeEach(async () => {
      await clearRole();
    });

    it('jetons valides : refresh silencieux + restaure le rôle', async () => {
      await setRole('coach');
      fetchMock.mockResolvedValue(
        jsonResponse({ accessToken: 'new-access', refreshToken: 'new-refresh', expiresIn: 900 }),
      );

      const restored = await restoreSession();

      expect(restored).toBe('coach');
      expect(getTokens()).toEqual({ accessToken: 'new-access', refreshToken: 'new-refresh' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('échec dur du refresh (401) : déconnexion (jetons + rôle effacés), renvoie null', async () => {
      await setRole('athlete');
      fetchMock.mockResolvedValue(jsonResponse({ error: 'UNAUTHORIZED' }, 401));

      const restored = await restoreSession();

      expect(restored).toBeNull();
      expect(getTokens()).toBeNull();
      expect(await loadRole()).toBeNull();
    });

    it('erreur réseau : conserve la session (reprise optimiste)', async () => {
      await setRole('coach');
      fetchMock.mockRejectedValue(new Error('network down'));

      const restored = await restoreSession();

      expect(restored).toBe('coach');
      expect(getTokens()).toEqual({ accessToken: 'old-access', refreshToken: 'old-refresh' });
      expect(getRole()).toBe('coach');
    });

    it('aucun jeton mais rôle orphelin : nettoie le rôle, renvoie null, aucun refresh', async () => {
      await clearTokens();
      await setRole('coach');

      const restored = await restoreSession();

      expect(restored).toBeNull();
      expect(await loadRole()).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
