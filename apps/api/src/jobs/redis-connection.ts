import type { RedisOptions } from 'ioredis';

/**
 * Dérive les options de connexion ioredis depuis `REDIS_URL`, partagées par la
 * `Queue` (producteur, côté API) et le `Worker` (consommateur). BullMQ recommande
 * `maxRetriesPerRequest: null` pour les connexions de worker (blocage long).
 */
export function redisConnectionFromUrl(redisUrl: string | undefined): RedisOptions {
  if (!redisUrl) {
    throw new Error('REDIS_URL est requis pour la file de jobs (BullMQ)');
  }
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    ...(url.password ? { password: url.password } : {}),
    ...(url.username ? { username: url.username } : {}),
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
    maxRetriesPerRequest: null,
  };
}
