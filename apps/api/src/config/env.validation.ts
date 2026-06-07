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

  if (errors.length > 0) {
    throw new Error(`Configuration d'environnement invalide :\n- ${errors.join('\n- ')}`);
  }

  return {
    NODE_ENV: nodeEnv as NodeEnv,
    PORT: port,
    DATABASE_URL: databaseUrl,
    ...(redisUrl ? { REDIS_URL: redisUrl } : {}),
  };
}
