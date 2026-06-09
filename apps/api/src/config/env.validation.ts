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
  /**
   * Connexion Redis — file de jobs BullMQ et cache (ADR-09/13). Requise en
   * staging/production (l'API y produit des jobs, le worker les consomme) ;
   * optionnelle en dev/test. Le worker échoue au démarrage si absente.
   */
  REDIS_URL?: string;
  /**
   * Stockage objet OVH (S3-compatible) pour les archives d'export RGPD (ADR-13).
   * Requis en staging/production ; optionnel en dev/test (l'API et la suite de
   * tests démarrent sans). Le worker échoue au démarrage si la config est absente.
   */
  S3_ENDPOINT?: string;
  S3_REGION?: string;
  S3_BUCKET?: string;
  S3_ACCESS_KEY_ID?: string;
  S3_SECRET_ACCESS_KEY?: string;
  /** Durée de vie de l'archive d'export en heures (→ `expires_at`). Défaut 24. */
  EXPORT_ARCHIVE_TTL_HOURS: number;
  /** TTL de l'URL présignée de téléchargement, en secondes. Défaut 86400 (24 h). */
  EXPORT_URL_TTL_SECONDS: number;
  /**
   * Délai de rétention avant purge/anonymisation définitive d'un compte supprimé,
   * en jours (TLX-034 / ADR-15). Défaut 30 (rétention des sauvegardes, TX-SEC-003 §9.2).
   */
  ACCOUNT_PURGE_RETENTION_DAYS: number;
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
  /**
   * Jeton de scrape de `GET /metrics` (TLX-83). Optionnel : s'il est défini, un
   * `Authorization: Bearer <token>` valide est exigé ; sinon l'endpoint est ouvert
   * (dev, ou prod derrière un réseau restreint). Secret d'environnement, jamais en dur.
   */
  METRICS_TOKEN?: string;
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

  const isProdLike = nodeEnv === 'staging' || nodeEnv === 'production';

  // Redis (file de jobs BullMQ) : requis en staging/prod, optionnel en dev/test.
  const redisUrl = (raw.REDIS_URL as string)?.trim();
  if (redisUrl && !/^redis(s)?:\/\//.test(redisUrl)) {
    errors.push('REDIS_URL, si défini, doit être une URL redis://');
  }
  if (isProdLike && !redisUrl) {
    errors.push(`REDIS_URL est requis en ${nodeEnv} (file de jobs BullMQ)`);
  }

  // Stockage objet OVH (S3) pour les archives d'export RGPD (ADR-13).
  const s3Endpoint = (raw.S3_ENDPOINT as string)?.trim();
  const s3Region = (raw.S3_REGION as string)?.trim();
  const s3Bucket = (raw.S3_BUCKET as string)?.trim();
  const s3AccessKeyId = (raw.S3_ACCESS_KEY_ID as string)?.trim();
  const s3SecretAccessKey = (raw.S3_SECRET_ACCESS_KEY as string)?.trim();
  if (s3Endpoint && !/^https?:\/\//.test(s3Endpoint)) {
    errors.push('S3_ENDPOINT, si défini, doit être une URL http(s)://');
  }
  if (isProdLike) {
    const missing = [
      ['S3_ENDPOINT', s3Endpoint],
      ['S3_REGION', s3Region],
      ['S3_BUCKET', s3Bucket],
      ['S3_ACCESS_KEY_ID', s3AccessKeyId],
      ['S3_SECRET_ACCESS_KEY', s3SecretAccessKey],
    ]
      .filter(([, value]) => !value)
      .map(([name]) => name);
    if (missing.length > 0) {
      errors.push(`Configuration S3 requise en ${nodeEnv} : ${missing.join(', ')} manquant(s)`);
    }
  }

  // Durées de vie (non secrètes, défauts sûrs).
  const archiveTtlRaw = (raw.EXPORT_ARCHIVE_TTL_HOURS as string) ?? '24';
  const archiveTtlHours = Number(archiveTtlRaw);
  if (!Number.isInteger(archiveTtlHours) || archiveTtlHours <= 0) {
    errors.push(`EXPORT_ARCHIVE_TTL_HOURS doit être un entier > 0 (reçu : "${archiveTtlRaw}")`);
  }
  const urlTtlRaw = (raw.EXPORT_URL_TTL_SECONDS as string) ?? '86400';
  const urlTtlSeconds = Number(urlTtlRaw);
  if (!Number.isInteger(urlTtlSeconds) || urlTtlSeconds <= 0) {
    errors.push(`EXPORT_URL_TTL_SECONDS doit être un entier > 0 (reçu : "${urlTtlRaw}")`);
  }
  const purgeDaysRaw = (raw.ACCOUNT_PURGE_RETENTION_DAYS as string) ?? '30';
  const purgeRetentionDays = Number(purgeDaysRaw);
  if (!Number.isInteger(purgeRetentionDays) || purgeRetentionDays <= 0) {
    errors.push(`ACCOUNT_PURGE_RETENTION_DAYS doit être un entier > 0 (reçu : "${purgeDaysRaw}")`);
  }

  // Clé de signature RS256 (TLX-020). En staging/prod elle est obligatoire et ne
  // doit jamais être une valeur en dur ; en dev/test une clé éphémère est générée
  // par KeyService si absente. La validation cryptographique fine (RSA ≥ 2048,
  // PEM lisible) est faite par KeyService au démarrage.
  const jwtPrivateKey = (raw.JWT_PRIVATE_KEY as string)?.trim();
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

  // Jeton de scrape de /metrics (TLX-83) : optionnel, non requis (l'endpoint peut
  // rester ouvert derrière un réseau restreint). Aucune valeur par défaut.
  const metricsToken = (raw.METRICS_TOKEN as string)?.trim();

  if (errors.length > 0) {
    throw new Error(`Configuration d'environnement invalide :\n- ${errors.join('\n- ')}`);
  }

  return {
    NODE_ENV: nodeEnv as NodeEnv,
    PORT: port,
    DATABASE_URL: databaseUrl,
    ...(redisUrl ? { REDIS_URL: redisUrl } : {}),
    ...(s3Endpoint ? { S3_ENDPOINT: s3Endpoint } : {}),
    ...(s3Region ? { S3_REGION: s3Region } : {}),
    ...(s3Bucket ? { S3_BUCKET: s3Bucket } : {}),
    ...(s3AccessKeyId ? { S3_ACCESS_KEY_ID: s3AccessKeyId } : {}),
    ...(s3SecretAccessKey ? { S3_SECRET_ACCESS_KEY: s3SecretAccessKey } : {}),
    EXPORT_ARCHIVE_TTL_HOURS: archiveTtlHours,
    EXPORT_URL_TTL_SECONDS: urlTtlSeconds,
    ACCOUNT_PURGE_RETENTION_DAYS: purgeRetentionDays,
    ...(jwtPrivateKey ? { JWT_PRIVATE_KEY: jwtPrivateKey } : {}),
    ...(jwtKeyId ? { JWT_KEY_ID: jwtKeyId } : {}),
    ...(jwtAdditionalPublicKeys ? { JWT_ADDITIONAL_PUBLIC_KEYS: jwtAdditionalPublicKeys } : {}),
    CONSENT_TEXT_VERSION: consentTextVersion,
    ...(metricsToken ? { METRICS_TOKEN: metricsToken } : {}),
  };
}
