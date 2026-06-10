import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { OwnershipService } from '../common/authorization/ownership.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { EntriesService } from './entries.service';

const COACH: AuthenticatedUser = { id: 'c-1', role: 'coach' };
const ATHLETE: AuthenticatedUser = { id: 'a-1', role: 'athlete' };

function competitionRow(over: Record<string, unknown> = {}) {
  return {
    id: 'k-1',
    coachId: 'c-1',
    name: 'Meeting de printemps',
    discipline: null,
    location: null,
    startDate: new Date('2026-07-01T00:00:00.000Z'),
    endDate: null,
    description: null,
    status: 'draft',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    deletedAt: null,
    ...over,
  };
}

function entryRow(over: Record<string, unknown> = {}) {
  return {
    id: 'e-1',
    competitionId: 'k-1',
    athleteId: 'a-1',
    eventLabel: '100m',
    status: 'engaged',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    deletedAt: null,
    ...over,
  };
}

function ownershipMock(over: Partial<OwnershipService> = {}): OwnershipService {
  return {
    assertCompetitionOwnedByCoach: jest.fn().mockResolvedValue(undefined),
    assertCoachLinkedToAthlete: jest.fn().mockResolvedValue(undefined),
    ...over,
  } as unknown as OwnershipService;
}

type PrismaMock = {
  competition: Record<string, jest.Mock>;
  competitionEntry: Record<string, jest.Mock>;
  $transaction: jest.Mock;
};

function prismaMock(): PrismaMock {
  const mock: PrismaMock = {
    competition: { findFirst: jest.fn() },
    competitionEntry: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn((arg: unknown) =>
      Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(mock),
    ),
  };
  return mock;
}

function service(prisma: PrismaMock, ownership = ownershipMock()): EntriesService {
  return new EntriesService(prisma as unknown as PrismaService, ownership);
}

describe('EntriesService', () => {
  describe('engageAthletes', () => {
    it('crée un engagement pour un athlète lié (déduplication des ids)', async () => {
      const prisma = prismaMock();
      const ownership = ownershipMock();
      prisma.competitionEntry.findFirst.mockResolvedValue(null);
      prisma.competitionEntry.create.mockResolvedValue(entryRow());
      const res = await service(prisma, ownership).engageAthletes('c-1', 'k-1', {
        athleteIds: ['a-1', 'a-1'],
        eventLabel: '100m',
      });

      expect(ownership.assertCompetitionOwnedByCoach).toHaveBeenCalledWith('c-1', 'k-1');
      expect(ownership.assertCoachLinkedToAthlete).toHaveBeenCalledTimes(1);
      expect(prisma.competitionEntry.create).toHaveBeenCalledTimes(1);
      expect(res.data).toHaveLength(1);
      expect(res.data[0]).toMatchObject({
        athleteId: 'a-1',
        status: 'engaged',
        eventLabel: '100m',
      });
    });

    it('idempotent : renvoie l’engagement actif existant sans recréer', async () => {
      const prisma = prismaMock();
      prisma.competitionEntry.findFirst.mockResolvedValue(entryRow());
      const res = await service(prisma).engageAthletes('c-1', 'k-1', { athleteIds: ['a-1'] });
      expect(prisma.competitionEntry.create).not.toHaveBeenCalled();
      expect(res.data[0].id).toBe('e-1');
    });

    it('403 si un athlète n’est pas lié au coach', async () => {
      const prisma = prismaMock();
      const ownership = ownershipMock({
        assertCoachLinkedToAthlete: jest.fn().mockRejectedValue(new ForbiddenException()),
      });
      await expect(
        service(prisma, ownership).engageAthletes('c-1', 'k-1', { athleteIds: ['a-9'] }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('listEntries', () => {
    it('404 si la compétition est introuvable', async () => {
      const prisma = prismaMock();
      prisma.competition.findFirst.mockResolvedValue(null);
      await expect(service(prisma).listEntries(COACH, 'k-x')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('coach propriétaire : liste les engagements actifs', async () => {
      const prisma = prismaMock();
      prisma.competition.findFirst.mockResolvedValue(competitionRow());
      prisma.competitionEntry.findMany.mockResolvedValue([entryRow()]);
      const res = await service(prisma).listEntries(COACH, 'k-1');
      expect(prisma.competitionEntry.findMany.mock.calls[0][0].where).toEqual({
        competitionId: 'k-1',
        deletedAt: null,
      });
      expect(res.data).toHaveLength(1);
    });

    it('403 si athlète non engagé', async () => {
      const prisma = prismaMock();
      prisma.competition.findFirst.mockResolvedValue(competitionRow());
      prisma.competitionEntry.findFirst.mockResolvedValue(null);
      await expect(service(prisma).listEntries(ATHLETE, 'k-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('unengageAthlete', () => {
    it('soft-delete de l’engagement après ownership', async () => {
      const prisma = prismaMock();
      const ownership = ownershipMock();
      prisma.competitionEntry.findFirst.mockResolvedValue({ id: 'e-1' });
      prisma.competitionEntry.update.mockResolvedValue(entryRow({ deletedAt: new Date() }));
      await service(prisma, ownership).unengageAthlete('c-1', 'k-1', 'e-1');
      expect(ownership.assertCompetitionOwnedByCoach).toHaveBeenCalledWith('c-1', 'k-1');
      expect(prisma.competitionEntry.update.mock.calls[0][0].data.deletedAt).toBeInstanceOf(Date);
    });

    it('404 si l’engagement n’existe pas', async () => {
      const prisma = prismaMock();
      prisma.competitionEntry.findFirst.mockResolvedValue(null);
      await expect(service(prisma).unengageAthlete('c-1', 'k-1', 'e-x')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
