/**
 * Chargement et validation du keystore RS256 depuis l'environnement (TLX-020).
 *
 * Fonctions PURES (aucune dépendance Nest) → testables directement. La clé privée
 * active vient de `JWT_PRIVATE_KEY` ; les clés publiques retirées encore acceptées
 * pendant une rotation viennent de `JWT_ADDITIONAL_PUBLIC_KEYS`. Seule la clé
 * active possède une partie privée en mémoire : une rotation ne garde que le
 * public des anciennes clés (limitation de l'exposition des secrets).
 *
 * Aucune valeur en dur : tout provient de l'environnement (cf. README keys/).
 */
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  type KeyObject,
} from 'node:crypto';
import { type NodeEnv } from '../../config/env.validation';
import { type KeyStore, type VerificationKey } from './key.types';

/** Taille de module RSA minimale acceptée (et générée). */
export const MIN_MODULUS_BITS = 2048;

/** Variables d'environnement consommées par le keystore. */
export interface JwtKeyEnv {
  JWT_PRIVATE_KEY?: string;
  JWT_KEY_ID?: string;
  JWT_ADDITIONAL_PUBLIC_KEYS?: string;
}

/** Résultat du chargement : le keystore + un drapeau « clé éphémère générée ». */
export interface LoadedKeyStore {
  store: KeyStore;
  /** Vrai si une clé éphémère a été générée (dev/test sans JWT_PRIVATE_KEY). */
  ephemeral: boolean;
}

/** Normalise un PEM : déséchappe les `\n` des `.env` mono-ligne, trim. */
export function normalizePem(raw: string): string {
  return raw.replace(/\\n/g, '\n').trim();
}

/**
 * `kid` déterministe = thumbprint JWK RFC 7638 (SHA-256, base64url) de la clé
 * publique. Stable pour une même clé, sans configuration manuelle.
 */
export function thumbprintKid(publicKey: KeyObject): string {
  const jwk = publicKey.export({ format: 'jwk' }) as { kty: string; n: string; e: string };
  // Membres requis, triés lexicographiquement, JSON sans espace (RFC 7638 §3.2).
  const canonical = JSON.stringify({ e: jwk.e, kty: jwk.kty, n: jwk.n });
  return createHash('sha256').update(canonical).digest('base64url');
}

function assertRsa(key: KeyObject, label: string): void {
  if (key.asymmetricKeyType !== 'rsa') {
    throw new Error(`${label} doit être une clé RSA (RS256)`);
  }
  const modulus = key.asymmetricKeyDetails?.modulusLength ?? 0;
  if (modulus < MIN_MODULUS_BITS) {
    throw new Error(`${label} doit faire au moins ${MIN_MODULUS_BITS} bits (reçu ${modulus})`);
  }
}

/** Génère une paire RSA RS256 au format PEM (PKCS#8 privé / SPKI public). */
export function generateKeyPairPem(): { privateKey: string; publicKey: string } {
  return generateKeyPairSync('rsa', {
    modulusLength: MIN_MODULUS_BITS,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
}

function parseAdditionalPublicKeys(raw: string | undefined): VerificationKey[] {
  if (!raw?.trim()) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`JWT_ADDITIONAL_PUBLIC_KEYS doit être du JSON : ${(error as Error).message}`, {
      cause: error,
    });
  }
  if (!Array.isArray(parsed)) {
    throw new Error('JWT_ADDITIONAL_PUBLIC_KEYS doit être un tableau JSON [{ kid, publicKey }]');
  }

  return parsed.map((entry, i) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`JWT_ADDITIONAL_PUBLIC_KEYS[${i}] doit être un objet { kid, publicKey }`);
    }
    const { kid, publicKey } = entry as { kid?: unknown; publicKey?: unknown };
    if (typeof publicKey !== 'string' || !publicKey.trim()) {
      throw new Error(`JWT_ADDITIONAL_PUBLIC_KEYS[${i}].publicKey est requis (PEM)`);
    }
    let pub: KeyObject;
    try {
      pub = createPublicKey(normalizePem(publicKey));
    } catch (error) {
      throw new Error(
        `JWT_ADDITIONAL_PUBLIC_KEYS[${i}].publicKey illisible : ${(error as Error).message}`,
        { cause: error },
      );
    }
    assertRsa(pub, `JWT_ADDITIONAL_PUBLIC_KEYS[${i}].publicKey`);
    const resolvedKid = typeof kid === 'string' && kid.trim() ? kid.trim() : thumbprintKid(pub);
    return { kid: resolvedKid, publicKey: pub };
  });
}

function buildStore(env: JwtKeyEnv, privatePem: string): KeyStore {
  let privateKey: KeyObject;
  try {
    privateKey = createPrivateKey(normalizePem(privatePem));
  } catch (error) {
    throw new Error(`JWT_PRIVATE_KEY illisible : ${(error as Error).message}`, { cause: error });
  }
  assertRsa(privateKey, 'JWT_PRIVATE_KEY');
  const publicKey = createPublicKey(privateKey);
  const kid = env.JWT_KEY_ID?.trim() || thumbprintKid(publicKey);

  const verification: VerificationKey[] = [{ kid, publicKey }];
  for (const extra of parseAdditionalPublicKeys(env.JWT_ADDITIONAL_PUBLIC_KEYS)) {
    if (verification.some((v) => v.kid === extra.kid)) {
      throw new Error(`kid en double entre la clé active et une clé additionnelle : ${extra.kid}`);
    }
    verification.push(extra);
  }

  return { signing: { kid, privateKey, publicKey }, verification };
}

/**
 * Charge le keystore depuis l'environnement.
 * - `JWT_PRIVATE_KEY` présente → keystore réel (signature + rotation).
 * - absente en dev/test → clé éphémère générée en mémoire (DX ; jetons perdus
 *   au redémarrage).
 * - absente en staging/production → erreur (fail-fast).
 */
export function loadKeyStore(env: JwtKeyEnv, nodeEnv: NodeEnv): LoadedKeyStore {
  const privatePem = env.JWT_PRIVATE_KEY?.trim();

  if (!privatePem) {
    if (nodeEnv === 'development' || nodeEnv === 'test') {
      const generated = generateKeyPairPem();
      return { store: buildStore(env, generated.privateKey), ephemeral: true };
    }
    throw new Error(`JWT_PRIVATE_KEY est requis en ${nodeEnv} (clé de signature RS256)`);
  }

  return { store: buildStore(env, privatePem), ephemeral: false };
}
