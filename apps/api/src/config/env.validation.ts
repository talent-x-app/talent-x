/**
 * Validation des variables d'environnement au démarrage (fail-fast).
 * Branchée sur ConfigModule.forRoot({ validate }) : l'API refuse de démarrer si
 * la configuration est incohérente, plutôt que d'échouer plus tard en production.
 * Aucun secret en dur : les valeurs viennent de l'environnement (.env en dev,
 * secrets d'environnement en staging/prod — cf. README « Environnements »).
 */

export type NodeEnv = 'development' | 'test' | 'staging' | 'production';

export interface EnvConfig {
  NODE_ENV: NodeEnv;
  PORT: number;
  DATABASE_URL: string;
  /** Optionnel tant que le worker/cache Redis (BullMQ) n'est pas câblé. */
  REDIS_URL?: string;
  /**
   * Clé privée RS256 (PEM PKCS#8) de signature des access tokens (TLX-020).
   * Requise en staging/production ; en dev/test, une clé éphémère est générée
   * au démarrage si absente. Les sauts de ligne peuvent être échappés (\n).
   */
  JWT_PRIVATE_KEY?: string;
  /** Identifiant de clé (kid) ; si absent, dérivé du thumbprint RFC 7638. */
  JWT_KEY_ID?: string;
  /**
   * Clés publiques additionnelles acceptées en vérification pendant une rotation
   * (JSON `[{ kid, publicKey }]`). Permet de valider les jetons signés par la
   * clé précédente le temps de leur expiration. Validation fine dans KeyService.
   */
  JWT_ADDITIONAL_PUBLIC_KEYS?: string;
  /**
   * Version courante des textes de consentement (TLX-031). Enregistrée avec chaque
   * consentement quand le client ne précise pas la version qu'il a présentée. À
   * incrémenter quand un texte change, pour tracer la base juridique (TX-SEC-003 §6).
   */
  CONSENT_TEXT_VERSION: string;
}

const NODE_ENVS: readonly NodeEnv[] = ['development', 'test', 'staging', 'production'];

export function validateEnv(raw: Record<string, unknown>): EnvConfig {
  const errors: string[] = [];

  const nodeEnv = (raw.NODE_ENV as string) ?? 'development';
  if (!NODE_ENVS.includes(nodeEnv as NodeEnv)) {
    errors.push(`NODE_ENV doit être l'un de ${NODE_ENVS.join(', ')} (reçu : "${nodeEnv}")`);
  }

  const databaseUrl = (raw.DATABASE_URL as string)?.trim();
  if (!databaseUrl) {
    errors.push('DATABASE_URL est requis');
  } else if (!/^postgres(ql)?:\/\//.test(databaseUrl)) {
    errors.push('DATABASE_URL doit être une URL postgresql://');
  }

  const portRaw = (raw.PORT as string) ?? '3000';
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    errors.push(`PORT doit être un entier entre 1 et 65535 (reçu : "${portRaw}")`);
  }

  const redisUrl = (raw.REDIS_URL as string)?.trim();
  if (redisUrl && !/^redis(s)?:\/\//.test(redisUrl)) {
    errors.push('REDIS_URL, si défini, doit être une URL redis://');
  }

  // Clé de signature RS256 (TLX-020). En staging/prod elle est obligatoire et ne
  // doit jamais être une valeur en dur ; en dev/test une clé éphémère est générée
  // par KeyService si absente. La validation cryptographique fine (RSA ≥ 2048,
  // PEM lisible) est faite par KeyService au démarrage.
  const jwtPrivateKey = (raw.JWT_PRIVATE_KEY as string)?.trim();
  const isProdLike = nodeEnv === 'staging' || nodeEnv === 'production';
  if (isProdLike && !jwtPrivateKey) {
    errors.push(`JWT_PRIVATE_KEY est requis en ${nodeEnv} (clé de signature RS256)`);
  }
  if (jwtPrivateKey && !jwtPrivateKey.includes('-----BEGIN')) {
    errors.push('JWT_PRIVATE_KEY doit être une clé PEM (bloc -----BEGIN ...-----)');
  }
  const jwtKeyId = (raw.JWT_KEY_ID as string)?.trim();
  const jwtAdditionalPublicKeys = (raw.JWT_ADDITIONAL_PUBLIC_KEYS as string)?.trim();

  // Version des textes de consentement (TLX-031). Défaut de config (non secret) ;
  // surchargeable par environnement quand les textes évoluent.
  const consentTextVersion = (raw.CONSENT_TEXT_VERSION as string)?.trim() || '2026-01';

  if (errors.length > 0) {
    throw new Error(`Configuration d'environnement invalide :\n- ${errors.join('\n- ')}`);
  }

  return {
    NODE_ENV: nodeEnv as NodeEnv,
    PORT: port,
    DATABASE_URL: databaseUrl,
    ...(redisUrl ? { REDIS_URL: redisUrl } : {}),
    ...(jwtPrivateKey ? { JWT_PRIVATE_KEY: jwtPrivateKey } : {}),
    ...(jwtKeyId ? { JWT_KEY_ID: jwtKeyId } : {}),
    ...(jwtAdditionalPublicKeys ? { JWT_ADDITIONAL_PUBLIC_KEYS: jwtAdditionalPublicKeys } : {}),
    CONSENT_TEXT_VERSION: consentTextVersion,
  };
}
