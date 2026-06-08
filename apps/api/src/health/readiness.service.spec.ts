import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../prisma/prisma.service';
import { ReadinessService } from './readiness.service';

/** ConfigService factice : `REDIS_URL` absent par défaut (Redis non vérifié). */
function configMock(values: Record<string, string> = {}): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

describe('ReadinessService', () => {
  it('status=ready quand la base répond (Redis non configuré → non vérifié)', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) };
    const service = new ReadinessService(prisma as unknown as PrismaService, configMock());

    await expect(service.check()).resolves.toEqual({
      status: 'ready',
      checks: { database: true },
    });
  });

  it('status=not_ready quand la base est injoignable', async () => {
    const prisma = { $queryRaw: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) };
    const service = new ReadinessService(prisma as unknown as PrismaService, configMock());

    await expect(service.check()).resolves.toEqual({
      status: 'not_ready',
      checks: { database: false },
    });
  });

  it('inclut le check redis quand REDIS_URL est configuré', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) };
    const service = new ReadinessService(
      prisma as unknown as PrismaService,
      configMock({ REDIS_URL: 'redis://localhost:6379' }),
    );
    // Évite une vraie connexion : on stub le ping.
    (service as unknown as { redis: () => { ping: () => Promise<string> } }).redis = () => ({
      ping: () => Promise.resolve('PONG'),
    });

    await expect(service.check()).resolves.toEqual({
      status: 'ready',
      checks: { database: true, redis: true },
    });
  });
});
