import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { type PrismaService } from '../../prisma/prisma.service';
import { OwnershipService } from './ownership.service';

interface PrismaMock {
  coachAthleteLink: { findFirst: jest.Mock };
  session: { findFirst: jest.Mock };
  group: { findFirst: jest.Mock };
}

function makeService() {
  const prisma: PrismaMock = {
    coachAthleteLink: { findFirst: jest.fn() },
    session: { findFirst: jest.fn() },
    group: { findFirst: jest.fn() },
  };
  const service = new OwnershipService(prisma as unknown as PrismaService);
  return { service, prisma };
}

describe('OwnershipService (TLX-024)', () => {
  describe('appartenance coach↔athlète', () => {
    it('isCoachLinkedToAthlete = true sur lien actif', async () => {
      const { service, prisma } = makeService();
      prisma.coachAthleteLink.findFirst.mockResolvedValue({ id: 'l1' });

      await expect(service.isCoachLinkedToAthlete('c1', 'a1')).resolves.toBe(true);
      expect(prisma.coachAthleteLink.findFirst).toHaveBeenCalledWith({
        where: { coachId: 'c1', athleteId: 'a1', endedAt: null },
        select: { id: true },
      });
    });

    it('isCoachLinkedToAthlete = false sans lien actif', async () => {
      const { service, prisma } = makeService();
      prisma.coachAthleteLink.findFirst.mockResolvedValue(null);

      await expect(service.isCoachLinkedToAthlete('c1', 'a1')).resolves.toBe(false);
    });

    it('assertCoachLinkedToAthlete passe sur lien actif', async () => {
      const { service, prisma } = makeService();
      prisma.coachAthleteLink.findFirst.mockResolvedValue({ id: 'l1' });

      await expect(service.assertCoachLinkedToAthlete('c1', 'a1')).resolves.toBeUndefined();
    });

    it('assertCoachLinkedToAthlete → 403 sans lien actif', async () => {
      const { service, prisma } = makeService();
      prisma.coachAthleteLink.findFirst.mockResolvedValue(null);

      await expect(service.assertCoachLinkedToAthlete('c1', 'a1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('ownership de séance', () => {
    it('passe si la séance appartient au coach', async () => {
      const { service, prisma } = makeService();
      prisma.session.findFirst.mockResolvedValue({ coachId: 'c1' });

      await expect(service.assertSessionOwnedByCoach('c1', 's1')).resolves.toBeUndefined();
      expect(prisma.session.findFirst).toHaveBeenCalledWith({
        where: { id: 's1', deletedAt: null },
        select: { coachId: true },
      });
    });

    it('→ 404 si la séance est introuvable ou supprimée', async () => {
      const { service, prisma } = makeService();
      prisma.session.findFirst.mockResolvedValue(null);

      await expect(service.assertSessionOwnedByCoach('c1', 's1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('→ 403 si la séance appartient à un autre coach', async () => {
      const { service, prisma } = makeService();
      prisma.session.findFirst.mockResolvedValue({ coachId: 'other' });

      await expect(service.assertSessionOwnedByCoach('c1', 's1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('ownership de groupe', () => {
    it('passe si le groupe appartient au coach', async () => {
      const { service, prisma } = makeService();
      prisma.group.findFirst.mockResolvedValue({ coachId: 'c1' });

      await expect(service.assertGroupOwnedByCoach('c1', 'g1')).resolves.toBeUndefined();
      expect(prisma.group.findFirst).toHaveBeenCalledWith({
        where: { id: 'g1', deletedAt: null },
        select: { coachId: true },
      });
    });

    it('→ 404 si le groupe est introuvable ou supprimé', async () => {
      const { service, prisma } = makeService();
      prisma.group.findFirst.mockResolvedValue(null);

      await expect(service.assertGroupOwnedByCoach('c1', 'g1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('→ 403 si le groupe appartient à un autre coach', async () => {
      const { service, prisma } = makeService();
      prisma.group.findFirst.mockResolvedValue({ coachId: 'other' });

      await expect(service.assertGroupOwnedByCoach('c1', 'g1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('propriété du compte', () => {
    it('passe si le titulaire agit sur son propre compte', () => {
      const { service } = makeService();
      expect(() => service.assertAccountOwner('u1', 'u1')).not.toThrow();
    });

    it('→ 403 sur le compte d’un tiers', () => {
      const { service } = makeService();
      expect(() => service.assertAccountOwner('u1', 'u2')).toThrow(ForbiddenException);
    });
  });
});
