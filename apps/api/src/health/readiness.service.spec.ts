import type { PrismaService } from '../prisma/prisma.service';
import { ReadinessService } from './readiness.service';

describe('ReadinessService', () => {
  it('status=ready quand la base répond', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) };
    const service = new ReadinessService(prisma as unknown as PrismaService);

    await expect(service.check()).resolves.toEqual({
      status: 'ready',
      checks: { database: true },
    });
  });

  it('status=not_ready quand la base est injoignable', async () => {
    const prisma = { $queryRaw: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) };
    const service = new ReadinessService(prisma as unknown as PrismaService);

    await expect(service.check()).resolves.toEqual({
      status: 'not_ready',
      checks: { database: false },
    });
  });
});
