import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../src/prisma/prisma.service';
import { ReadinessService } from '../src/health/readiness.service';

/**
 * Sonde de readiness — branche REDIS avec un VRAI client ioredis (TLX-232).
 *
 * Le spec unitaire (`readiness.service.spec.ts`) substitue `redis()` par un
 * double qui répond PONG : il ne pouvait donc pas voir que le client réel
 * rejetait sa première commande (`lazyConnect` + `enableOfflineQueue: false`).
 * D'où cette suite d'intégration, qui exerce le client tel qu'il est construit.
 *
 * Redis réel requis : `docker compose up -d` en local, service `redis` en CI.
 */
describe('ReadinessService — branche Redis (intégration, TLX-232)', () => {
  const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
  /** Port fermé : Redis réellement injoignable (ECONNREFUSED immédiat). */
  const UNREACHABLE_REDIS_URL = 'redis://127.0.0.1:6399';

  const configMock = (values: Record<string, string>): ConfigService =>
    ({ get: (key: string) => values[key] }) as unknown as ConfigService;

  /** Base toujours saine : c'est la branche Redis qui est sous test ici. */
  const healthyPrisma = (): PrismaService =>
    ({ $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) }) as unknown as PrismaService;

  let service: ReadinessService;

  afterEach(async () => {
    // Ferme le client lazy — sans quoi Jest garde un handle ouvert.
    await service?.onModuleDestroy();
  });

  it('PREMIER appel après construction du client → ready (le défaut de TLX-232)', async () => {
    service = new ReadinessService(healthyPrisma(), configMock({ REDIS_URL }));

    // Aucune requête préalable : c'est exactement l'état de l'API au démarrage,
    // quand le déploiement interroge /ready pour la première fois.
    await expect(service.check()).resolves.toEqual({
      status: 'ready',
      checks: { database: true, redis: true },
    });
  });

  it('appels suivants → ready également (non-régression du chemin nominal)', async () => {
    service = new ReadinessService(healthyPrisma(), configMock({ REDIS_URL }));

    await service.check();
    await expect(service.check()).resolves.toEqual({
      status: 'ready',
      checks: { database: true, redis: true },
    });
    await expect(service.check()).resolves.toEqual({
      status: 'ready',
      checks: { database: true, redis: true },
    });
  });

  it('après un échec, la sonde repart d’un client neuf (Redis revenu → ready)', async () => {
    let url = UNREACHABLE_REDIS_URL;
    service = new ReadinessService(healthyPrisma(), {
      get: (key: string) => (key === 'REDIS_URL' ? url : undefined),
    } as unknown as ConfigService);

    await expect(service.check()).resolves.toMatchObject({ status: 'not_ready' });

    // Redis redevient joignable. `retryStrategy: () => null` interdisant toute
    // reconnexion, un client conservé après échec resterait mort à jamais et la
    // sonde mentirait dans l'autre sens — 503 permanent sur un Redis sain.
    url = REDIS_URL;
    await expect(service.check()).resolves.toEqual({
      status: 'ready',
      checks: { database: true, redis: true },
    });
  }, 15_000);

  it('Redis réellement injoignable → not_ready, et sans faire traîner la sonde', async () => {
    service = new ReadinessService(
      healthyPrisma(),
      configMock({ REDIS_URL: UNREACHABLE_REDIS_URL }),
    );

    const startedAt = Date.now();
    await expect(service.check()).resolves.toEqual({
      status: 'not_ready',
      checks: { database: true, redis: false },
    });
    // Garde-fou sur `retryStrategy: () => null` : sans lui, ioredis réessaierait
    // en boucle et la sonde attendrait au lieu d'échouer. Borne large — on veut
    // détecter une attente, pas mesurer une latence.
    expect(Date.now() - startedAt).toBeLessThan(5_000);
  }, 15_000);
});
