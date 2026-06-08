import * as SecureStore from 'expo-secure-store';
import { clearTokens, getTokens, loadTokens, setTokens } from './token-store';

// Mock du trousseau : magasin en mémoire (pas d'accès natif en test).
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    __store: store,
    getItemAsync: jest.fn(async (k: string) => store.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => void store.set(k, v)),
    deleteItemAsync: jest.fn(async (k: string) => void store.delete(k)),
  };
});

const store = (SecureStore as unknown as { __store: Map<string, string> }).__store;

describe('token-store (stockage sécurisé des jetons)', () => {
  beforeEach(async () => {
    store.clear();
    await loadTokens();
  });

  it('persiste et relit les jetons (cache + trousseau)', async () => {
    await setTokens({ accessToken: 'a1', refreshToken: 'r1' });

    expect(getTokens()).toEqual({ accessToken: 'a1', refreshToken: 'r1' });
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('talentx.accessToken', 'a1');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('talentx.refreshToken', 'r1');
  });

  it('hydrate le cache mémoire depuis le trousseau au démarrage', async () => {
    store.set('talentx.accessToken', 'a2');
    store.set('talentx.refreshToken', 'r2');

    const loaded = await loadTokens();

    expect(loaded).toEqual({ accessToken: 'a2', refreshToken: 'r2' });
    expect(getTokens()).toEqual({ accessToken: 'a2', refreshToken: 'r2' });
  });

  it('renvoie null si un seul jeton est présent (session incohérente)', async () => {
    store.set('talentx.accessToken', 'a3');

    expect(await loadTokens()).toBeNull();
  });

  it('efface les jetons (déconnexion)', async () => {
    await setTokens({ accessToken: 'a1', refreshToken: 'r1' });

    await clearTokens();

    expect(getTokens()).toBeNull();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('talentx.accessToken');
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('talentx.refreshToken');
  });
});
