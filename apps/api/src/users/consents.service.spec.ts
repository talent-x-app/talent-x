import { type ConfigService } from '@nestjs/config';
import { type PrismaService } from '../prisma/prisma.service';
import { ConsentsService } from './consents.service';

interface PrismaMock {
  consent: { findMany: jest.Mock; create: jest.Mock };
}

function makeService(consentTextVersion = '2026-01') {
  const prisma: PrismaMock = {
    consent: { findMany: jest.fn(), create: jest.fn() },
  };
  const config = { get: jest.fn().mockReturnValue(consentTextVersion) } as unknown as ConfigService;
  const service = new ConsentsService(prisma as unknown as PrismaService, config);
  return { service, prisma, config };
}

describe('ConsentsService (TLX-031)', () => {
  describe('list', () => {
    it('renvoie l’état courant par type (dernière ligne) projeté en DTO', async () => {
      const { service, prisma } = makeService();
      prisma.consent.findMany.mockResolvedValue([
        {
          type: 'data_processing',
          granted: true,
          textVersion: '2026-01',
          createdAt: new Date('2026-02-01T10:00:00.000Z'),
        },
      ]);

      await expect(service.list('u1')).resolves.toEqual({
        data: [
          {
            type: 'data_processing',
            granted: true,
            textVersion: '2026-01',
            updatedAt: '2026-02-01T10:00:00.000Z',
          },
        ],
      });
      // distinct par type, plus récent d'abord → état courant.
      expect(prisma.consent.findMany).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        orderBy: { createdAt: 'desc' },
        distinct: ['type'],
      });
    });

    it('renvoie une liste vide si aucun consentement', async () => {
      const { service, prisma } = makeService();
      prisma.consent.findMany.mockResolvedValue([]);
      await expect(service.list('u1')).resolves.toEqual({ data: [] });
    });
  });

  describe('update', () => {
    it('consentement donné : insère une ligne avec granted_at, sans revoked_at', async () => {
      const { service, prisma } = makeService();
      prisma.consent.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...data, createdAt: new Date('2026-03-01T00:00:00.000Z') }),
      );

      const result = await service.update('u1', {
        type: 'coach_access',
        granted: true,
        textVersion: '2026-01',
      });

      const arg = prisma.consent.create.mock.calls[0][0].data;
      expect(arg.userId).toBe('u1');
      expect(arg.type).toBe('coach_access');
      expect(arg.granted).toBe(true);
      expect(arg.textVersion).toBe('2026-01');
      expect(arg.grantedAt).toBeInstanceOf(Date);
      expect(arg.revokedAt).toBeNull();
      expect(result).toMatchObject({ type: 'coach_access', granted: true, textVersion: '2026-01' });
    });

    it('consentement retiré : insère une ligne avec revoked_at, sans granted_at', async () => {
      const { service, prisma } = makeService();
      prisma.consent.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...data, createdAt: new Date('2026-03-02T00:00:00.000Z') }),
      );

      await service.update('u1', { type: 'marketing', granted: false, textVersion: '2026-01' });

      const arg = prisma.consent.create.mock.calls[0][0].data;
      expect(arg.granted).toBe(false);
      expect(arg.grantedAt).toBeNull();
      expect(arg.revokedAt).toBeInstanceOf(Date);
    });

    it('utilise la version courante configurée si le client n’en fournit pas', async () => {
      const { service, prisma, config } = makeService('2027-05');
      prisma.consent.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...data, createdAt: new Date('2027-06-01T00:00:00.000Z') }),
      );

      const result = await service.update('u1', { type: 'data_processing', granted: true });

      expect(config.get).toHaveBeenCalledWith('CONSENT_TEXT_VERSION');
      expect(prisma.consent.create.mock.calls[0][0].data.textVersion).toBe('2027-05');
      expect(result.textVersion).toBe('2027-05');
    });
  });
});
