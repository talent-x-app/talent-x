/**
 * Types du keystore RS256 (TLX-020, ADR-04).
 *
 * Les clés sont manipulées sous forme de `KeyObject` Node (pas de PEM brut qui
 * circule dans le code). Le keystore distingue la clé *active* de signature
 * (une seule, secrète) des clés de *vérification* (la clé active + d'éventuelles
 * clés retirées encore acceptées le temps d'une rotation).
 */
import { type KeyObject } from 'node:crypto';

/** Algorithme de signature des access tokens (ADR-04). */
export const JWT_ALG = 'RS256' as const;
export type JwtAlg = typeof JWT_ALG;

/** Clé active de signature : seule clé dont la partie privée est en mémoire. */
export interface SigningKey {
  kid: string;
  privateKey: KeyObject;
  publicKey: KeyObject;
}

/** Clé acceptée en vérification, identifiée par son `kid` (en-tête JWT). */
export interface VerificationKey {
  kid: string;
  publicKey: KeyObject;
}

/** Keystore résolu : une clé de signature + l'ensemble des clés de vérification. */
export interface KeyStore {
  signing: SigningKey;
  /** Inclut toujours la clé active, plus les clés retirées en chevauchement. */
  verification: VerificationKey[];
}
