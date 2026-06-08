import { createPublicKey, generateKeyPairSync, type KeyObject } from 'node:crypto';
import { generateKeyPairPem, loadKeyStore, normalizePem, thumbprintKid } from './jwt-keys.config';

/** Paire RSA de test (générée une fois pour toute la suite). */
const keyA = generateKeyPairPem();
const keyB = generateKeyPairPem();

describe('jwt-keys.config (TLX-020)', () => {
  describe('normalizePem', () => {
    it('déséchappe les \\n des .env mono-ligne', () => {
      const escaped = keyA.privateKey.trim().replace(/\n/g, '\\n');
      expect(normalizePem(escaped)).toBe(keyA.privateKey.trim());
    });
  });

  describe('thumbprintKid', () => {
    it('est déterministe pour une même clé', () => {
      const pub = createPublicKey(keyA.publicKey);
      expect(thumbprintKid(pub)).toBe(thumbprintKid(pub));
    });

    it('diffère entre deux clés distinctes', () => {
      expect(thumbprintKid(createPublicKey(keyA.publicKey))).not.toBe(
        thumbprintKid(createPublicKey(keyB.publicKey)),
      );
    });
  });

  describe('loadKeyStore', () => {
    it('charge la clé active et dérive un kid (thumbprint) par défaut', () => {
      const { store, ephemeral } = loadKeyStore({ JWT_PRIVATE_KEY: keyA.privateKey }, 'production');
      expect(ephemeral).toBe(false);
      expect(store.signing.kid).toBe(thumbprintKid(createPublicKey(keyA.publicKey)));
      expect(store.verification).toHaveLength(1);
      expect(store.verification[0]?.kid).toBe(store.signing.kid);
    });

    it('respecte un JWT_KEY_ID explicite', () => {
      const { store } = loadKeyStore(
        { JWT_PRIVATE_KEY: keyA.privateKey, JWT_KEY_ID: 'k-2026-06' },
        'production',
      );
      expect(store.signing.kid).toBe('k-2026-06');
    });

    it('accepte une clé privée mono-ligne (\\n échappés)', () => {
      const oneLine = keyA.privateKey.trim().replace(/\n/g, '\\n');
      const { store } = loadKeyStore({ JWT_PRIVATE_KEY: oneLine }, 'production');
      expect(store.signing.privateKey.asymmetricKeyType).toBe('rsa');
    });

    it('ajoute les clés publiques additionnelles (rotation par chevauchement)', () => {
      const additional = JSON.stringify([{ kid: 'old-1', publicKey: keyB.publicKey }]);
      const { store } = loadKeyStore(
        { JWT_PRIVATE_KEY: keyA.privateKey, JWT_ADDITIONAL_PUBLIC_KEYS: additional },
        'production',
      );
      expect(store.verification.map((v) => v.kid)).toEqual([store.signing.kid, 'old-1']);
    });

    it('génère une clé éphémère en dev si JWT_PRIVATE_KEY absente', () => {
      const { store, ephemeral } = loadKeyStore({}, 'development');
      expect(ephemeral).toBe(true);
      expect(store.signing.privateKey.asymmetricKeyType).toBe('rsa');
    });

    it('génère une clé éphémère en test si JWT_PRIVATE_KEY absente', () => {
      expect(loadKeyStore({}, 'test').ephemeral).toBe(true);
    });

    it('échoue (fail-fast) en production sans JWT_PRIVATE_KEY', () => {
      expect(() => loadKeyStore({}, 'production')).toThrow(/JWT_PRIVATE_KEY est requis/);
    });

    it('rejette une clé privée illisible', () => {
      expect(() => loadKeyStore({ JWT_PRIVATE_KEY: 'pas une clé' }, 'production')).toThrow(
        /JWT_PRIVATE_KEY/,
      );
    });

    it('rejette une clé non-RSA (mauvais algorithme)', () => {
      // Une clé EC ne doit pas être acceptée pour du RS256.
      const ec = generateKeyPairSync('ec', {
        namedCurve: 'P-256',
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        publicKeyEncoding: { type: 'spki', format: 'pem' },
      });
      expect(() => loadKeyStore({ JWT_PRIVATE_KEY: ec.privateKey }, 'production')).toThrow(/RSA/);
    });

    it('rejette une clé RSA trop courte (< 2048 bits)', () => {
      const weak = generateKeyPairSync('rsa', {
        modulusLength: 1024,
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        publicKeyEncoding: { type: 'spki', format: 'pem' },
      });
      expect(() => loadKeyStore({ JWT_PRIVATE_KEY: weak.privateKey }, 'production')).toThrow(
        /2048 bits/,
      );
    });

    it('rejette un JWT_ADDITIONAL_PUBLIC_KEYS non-JSON', () => {
      expect(() =>
        loadKeyStore(
          { JWT_PRIVATE_KEY: keyA.privateKey, JWT_ADDITIONAL_PUBLIC_KEYS: '{pas du json' },
          'production',
        ),
      ).toThrow(/JWT_ADDITIONAL_PUBLIC_KEYS doit être du JSON/);
    });

    it('rejette un kid en double entre clé active et clé additionnelle', () => {
      const additional = JSON.stringify([{ kid: 'k-2026-06', publicKey: keyB.publicKey }]);
      expect(() =>
        loadKeyStore(
          {
            JWT_PRIVATE_KEY: keyA.privateKey,
            JWT_KEY_ID: 'k-2026-06',
            JWT_ADDITIONAL_PUBLIC_KEYS: additional,
          },
          'production',
        ),
      ).toThrow(/kid en double/);
    });
  });
});

/** Garde-fou : la clé de vérification dérivée correspond bien à la clé active. */
function publicMatches(active: KeyObject, verif: KeyObject): boolean {
  return (
    active.export({ format: 'pem', type: 'spki' }).toString() ===
    verif.export({ format: 'pem', type: 'spki' }).toString()
  );
}

it('expose une clé publique de vérification cohérente avec la clé active', () => {
  const { store } = loadKeyStore({ JWT_PRIVATE_KEY: keyA.privateKey }, 'production');
  expect(publicMatches(store.signing.publicKey, store.verification[0]!.publicKey)).toBe(true);
});
