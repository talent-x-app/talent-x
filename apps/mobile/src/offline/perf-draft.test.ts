import type { KeyValueStore } from './key-value-store';
import {
  clearDraft,
  draftKey,
  loadDraft,
  parseDraft,
  saveDraft,
  serializeDraft,
  type PerfDraft,
} from './perf-draft';

/** Magasin clé→valeur en mémoire (pas d'IO native en test). */
function memoryStore(): KeyValueStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: async (k) => map.get(k) ?? null,
    setItem: async (k, v) => void map.set(k, v),
    removeItem: async (k) => void map.delete(k),
  };
}

const DRAFT: PerfDraft = {
  entries: [{ mode: 'time', times: ['7.45'] }],
  rpe: 8,
  notes: 'jambes lourdes',
  savedAt: '2026-06-13T10:00:00.000Z',
};

describe('perf-draft (TLX-077 — brouillon auto-save)', () => {
  it('cloisonne la clé par affectation', () => {
    expect(draftKey('as-1')).toBe('perf-draft.as-1');
    expect(draftKey('as-2')).not.toBe(draftKey('as-1'));
  });

  // TLX-137 : sur natif, expo-secure-store impose [A-Za-z0-9._-] ; un « : » lève
  // « Invalid key provided to SecureStore » → le brouillon n'était jamais persisté.
  it('produit une clé acceptée par SecureStore (charset [A-Za-z0-9._-], pas de « : »)', () => {
    const uuid = 'ca0f1e4d-b4be-4580-ad1d-8a9d5b6e3fc5';
    expect(draftKey(uuid)).toMatch(/^[A-Za-z0-9._-]+$/);
    expect(draftKey(uuid)).not.toContain(':');
  });

  it('loadDraft : un accès stockage qui lève → null (ne propage pas)', async () => {
    const throwing: KeyValueStore = {
      getItem: async () => {
        throw new Error('Invalid key provided to SecureStore.');
      },
      setItem: async () => undefined,
      removeItem: async () => undefined,
    };
    await expect(loadDraft(throwing, 'as-1')).resolves.toBeNull();
  });

  it('sérialise puis relit un brouillon à l’identique (round-trip)', () => {
    expect(parseDraft(serializeDraft(DRAFT))).toEqual(DRAFT);
  });

  it('persiste, relit et purge via le magasin', async () => {
    const store = memoryStore();
    await saveDraft(store, 'as-1', DRAFT);
    expect(store.map.get('perf-draft.as-1')).toBeDefined();
    expect(await loadDraft(store, 'as-1')).toEqual(DRAFT);

    await clearDraft(store, 'as-1');
    expect(await loadDraft(store, 'as-1')).toBeNull();
  });

  it('relecture défensive : absent / JSON corrompu / forme inattendue → null', () => {
    expect(parseDraft(null)).toBeNull();
    expect(parseDraft('')).toBeNull();
    expect(parseDraft('{not json')).toBeNull();
    expect(parseDraft(JSON.stringify({ rpe: 8, notes: 'x' }))).toBeNull(); // entries manquant
    expect(parseDraft(JSON.stringify({ entries: [], rpe: '8', notes: 'x' }))).toBeNull(); // rpe non numérique
  });

  it('tolère un savedAt absent (repli chaîne vide)', () => {
    const parsed = parseDraft(JSON.stringify({ entries: [], rpe: 7, notes: '' }));
    expect(parsed).toEqual({ entries: [], rpe: 7, notes: '', savedAt: '' });
  });
});
