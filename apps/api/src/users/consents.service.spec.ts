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
      // distinct par (type, coach), plus récent d'abord → état courant, y compris scopé (ADR-51 §D2).
      expect(prisma.consent.findMany).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        orderBy: { createdAt: 'desc' },
        distinct: ['type', 'coachId'],
      });
    });

    it('expose les entrées coach_access scopées à côté de l’entrée globale (ADR-51 §D2)', async () => {
      const { service, prisma } = makeService();
      prisma.consent.findMany.mockResolvedValue([
        {
          type: 'coach_access',
          granted: false,
          textVersion: '2026-01',
          coachId: 'c1',
          createdAt: new Date('2026-03-02T00:00:00.000Z'),
        },
        {
          type: 'coach_access',
          granted: true,
          textVersion: '2026-01',
          coachId: null,
          createdAt: new Date('2026-02-01T10:00:00.000Z'),
        },
      ]);

      const res = await service.list('u1');
      expect(res.data).toEqual([
        expect.objectContaining({ type: 'coach_access', granted: false, coachId: 'c1' }),
        expect.not.objectContaining({ coachId: expect.anything() }),
      ]);
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

    it('coach_access scopé : écrit coach_id et le renvoie dans le DTO (ADR-51 §D2)', async () => {
      const { service, prisma } = makeService();
      prisma.consent.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...data, createdAt: new Date('2026-03-03T00:00:00.000Z') }),
      );

      const result = await service.update('u1', {
        type: 'coach_access',
        granted: false,
        coachId: 'c1',
      });

      expect(prisma.consent.create.mock.calls[0][0].data.coachId).toBe('c1');
      expect(result).toMatchObject({ type: 'coach_access', granted: false, coachId: 'c1' });
    });

    it('coachId sur un autre type que coach_access → 422 CONSENT_COACH_SCOPE_INVALID', async () => {
      const { service, prisma } = makeService();

      await expect(
        service.update('u1', { type: 'marketing', granted: true, coachId: 'c1' }),
      ).rejects.toMatchObject({ response: { error: 'CONSENT_COACH_SCOPE_INVALID' } });
      expect(prisma.consent.create).not.toHaveBeenCalled();
    });

    it('sans coachId : écrit une décision globale (coach_id NULL, rétrocompat)', async () => {
      const { service, prisma } = makeService();
      prisma.consent.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...data, createdAt: new Date('2026-03-04T00:00:00.000Z') }),
      );

      const result = await service.update('u1', { type: 'coach_access', granted: true });

      expect(prisma.consent.create.mock.calls[0][0].data.coachId).toBeNull();
      expect(result).not.toHaveProperty('coachId');
    });
  });
});
