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
      // dernière ligne par (user, type) = état courant.
      expect(prisma.consent.findFirst).toHaveBeenCalledWith({
        where: { userId: 'a1', type: 'data_processing' },
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
