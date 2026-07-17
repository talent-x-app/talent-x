import { ForbiddenException } from '@nestjs/common';
import { type PrismaService } from '../../prisma/prisma.service';
import { ConsentGate } from './consent.gate';

interface PrismaMock {
  consent: { findFirst: jest.Mock };
}

function makeGate() {
  const prisma: PrismaMock = { consent: { findFirst: jest.fn() } };
  const gate = new ConsentGate(prisma as unknown as PrismaService);
  return { gate, prisma };
}

describe('ConsentGate (TLX-032)', () => {
  describe('hasActiveConsent', () => {
    it('true si la dernière ligne du type est accordée', async () => {
      const { gate, prisma } = makeGate();
      prisma.consent.findFirst.mockResolvedValue({ granted: true });

      await expect(gate.hasActiveConsent('a1', 'data_processing')).resolves.toBe(true);
      // Sans coachId : dernière ligne GLOBALE par (user, type) = état courant historique.
      expect(prisma.consent.findFirst).toHaveBeenCalledWith({
        where: { userId: 'a1', type: 'data_processing', coachId: null },
        orderBy: { createdAt: 'desc' },
        select: { granted: true },
      });
    });

    it('false si la dernière ligne est un retrait (granted=false)', async () => {
      const { gate, prisma } = makeGate();
      prisma.consent.findFirst.mockResolvedValue({ granted: false });
      await expect(gate.hasActiveConsent('a1', 'coach_access')).resolves.toBe(false);
    });

    it('false si aucun consentement n’a jamais été enregistré', async () => {
      const { gate, prisma } = makeGate();
      prisma.consent.findFirst.mockResolvedValue(null);
      await expect(gate.hasActiveConsent('a1', 'coach_access')).resolves.toBe(false);
    });

    it('avec coachId (ADR-51 §D2) : dernière ligne applicable = scopée à ce coach OU globale', async () => {
      const { gate, prisma } = makeGate();
      prisma.consent.findFirst.mockResolvedValue({ granted: true });

      await expect(gate.hasActiveConsent('a1', 'coach_access', 'c1')).resolves.toBe(true);
      // La requête fusionne les lignes scopées à c1 et les lignes globales (NULL) :
      // la plus récente tranche — une révocation scopée à c1 postérieure à un grant
      // global ne révoque que c1 ; une décision globale plus récente l'emporte partout.
      expect(prisma.consent.findFirst).toHaveBeenCalledWith({
        where: {
          userId: 'a1',
          type: 'coach_access',
          OR: [{ coachId: 'c1' }, { coachId: null }],
        },
        orderBy: { createdAt: 'desc' },
        select: { granted: true },
      });
    });

    it('deux coachs : révoquer c1 ne touche pas c2 (la ligne applicable diffère)', async () => {
      const { gate, prisma } = makeGate();
      // c1 : dernière ligne applicable = révocation scopée ; c2 : grant global plus ancien.
      prisma.consent.findFirst.mockImplementation(
        (args: { where: { OR: { coachId: string | null }[] } }) =>
          Promise.resolve(
            args.where.OR.some((c) => c.coachId === 'c1') ? { granted: false } : { granted: true },
          ),
      );

      await expect(gate.hasActiveConsent('a1', 'coach_access', 'c1')).resolves.toBe(false);
      await expect(gate.hasActiveConsent('a1', 'coach_access', 'c2')).resolves.toBe(true);
    });
  });

  describe('assertActiveConsent', () => {
    it('passe si le consentement est actif', async () => {
      const { gate, prisma } = makeGate();
      prisma.consent.findFirst.mockResolvedValue({ granted: true });
      await expect(gate.assertActiveConsent('a1', 'data_processing')).resolves.toBeUndefined();
    });

    it('→ 403 CONSENT_REQUIRED si le consentement n’est pas actif', async () => {
      const { gate, prisma } = makeGate();
      prisma.consent.findFirst.mockResolvedValue(null);

      await expect(gate.assertActiveConsent('a1', 'data_processing')).rejects.toMatchObject({
        response: { error: 'CONSENT_REQUIRED' },
      });
      await expect(gate.assertActiveConsent('a1', 'data_processing')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });
});
