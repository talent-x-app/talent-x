/**
 * Keystore RS256 injectable (TLX-020, ADR-04).
 *
 * Source de signature/vérification des access tokens pour tout l'API. Charge le
 * keystore au démarrage (fail-fast en staging/prod si la clé manque) et expose :
 * - la clé active de signature (`getSigningKey` / `getActiveKid`),
 * - la résolution d'une clé de vérification par `kid` (`getVerificationKey`),
 * supportant une rotation par chevauchement (anciens jetons encore vérifiables).
 *
 * Les valeurs viennent de l'environnement (process.env) — aucun secret en dur.
 */
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { type KeyObject } from 'node:crypto';
import { type NodeEnv } from '../../config/env.validation';
import { loadKeyStore } from './jwt-keys.config';
import { JWT_ALG, type JwtAlg, type KeyStore, type SigningKey } from './key.types';

@Injectable()
export class KeyService implements OnModuleInit {
  private readonly logger = new Logger(KeyService.name);
  private store: KeyStore | null = null;

  onModuleInit(): void {
    const nodeEnv = (process.env.NODE_ENV as NodeEnv) || 'development';
    const { store, ephemeral } = loadKeyStore(
      {
        JWT_PRIVATE_KEY: process.env.JWT_PRIVATE_KEY,
        JWT_KEY_ID: process.env.JWT_KEY_ID,
        JWT_ADDITIONAL_PUBLIC_KEYS: process.env.JWT_ADDITIONAL_PUBLIC_KEYS,
      },
      nodeEnv,
    );
    this.store = store;

    if (ephemeral) {
      this.logger.warn(
        `Clé RS256 éphémère générée (${nodeEnv}) : les jetons seront invalidés à chaque redémarrage. ` +
          'Définir JWT_PRIVATE_KEY pour une clé persistante.',
      );
    }
    this.logger.log(
      `Keystore RS256 prêt — kid actif "${store.signing.kid}", ${store.verification.length} clé(s) de vérification.`,
    );
  }

  private requireStore(): KeyStore {
    if (!this.store) {
      // onModuleInit n'a pas tourné (mauvais usage hors cycle de vie Nest).
      throw new Error('KeyService non initialisé (onModuleInit non exécuté).');
    }
    return this.store;
  }

  /** Algorithme de signature (constant, ADR-04). */
  get algorithm(): JwtAlg {
    return JWT_ALG;
  }

  /** Clé active de signature (kid + clés privée/publique). */
  getSigningKey(): SigningKey {
    return this.requireStore().signing;
  }

  /** `kid` de la clé active — à placer dans l'en-tête des JWT émis. */
  getActiveKid(): string {
    return this.requireStore().signing.kid;
  }

  /** Clé publique de vérification correspondant à un `kid`, ou `undefined`. */
  getVerificationKey(kid: string): KeyObject | undefined {
    return this.requireStore().verification.find((v) => v.kid === kid)?.publicKey;
  }

  /** Liste des `kid` acceptés en vérification (active + retirées en chevauchement). */
  listVerificationKids(): string[] {
    return this.requireStore().verification.map((v) => v.kid);
  }
}
