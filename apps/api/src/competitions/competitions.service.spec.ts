import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { OwnershipService } from '../common/authorization/ownership.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { CompetitionsService } from './competitions.service';
import { summarizeEntryStatus } from './competition.mapper';
import { CompetitionQueryDto } from './dto/competition-query.dto';
import { CompetitionStatus } from './dto/competition-create.dto';

const COACH: AuthenticatedUser = { id: 'c-1', role: 'coach' };
const ATHLETE: AuthenticatedUser = { id: 'a-1', role: 'athlete' };

function competitionRow(over: Record<string, unknown> = {}) {
  return {
    id: 'k-1',
    coachId: 'c-1',
    name: 'Meeting de printemps',
    discipline: 'Sprint',
    location: 'Paris',
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

function ownershipMock(over: Partial<OwnershipService> = {}): OwnershipService {
  return {
    assertCompetitionOwnedByCoach: jest.fn().mockResolvedValue(undefined),
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
    competition: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
    competitionEntry: { findFirst: jest.fn(), findMany: jest.fn() },
    $transaction: jest.fn((arg: unknown) =>
      Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(mock),
    ),
  };
  return mock;
}

function service(prisma: PrismaMock, ownership = ownershipMock()): CompetitionsService {
  return new CompetitionsService(prisma as unknown as PrismaService, ownership);
}

const baseQuery = (): CompetitionQueryDto =>
  Object.assign(new CompetitionQueryDto(), { page: 1, limit: 20 });

describe('summarizeEntryStatus (TLX-92)', () => {
  it('confirmed l’emporte sur tout', () => {
    expect(summarizeEntryStatus(['withdrawn', 'engaged', 'confirmed'])).toBe('confirmed');
  });
  it('engaged l’emporte sur withdrawn', () => {
    expect(summarizeEntryStatus(['withdrawn', 'engaged'])).toBe('engaged');
  });
  it('withdrawn seul', () => {
    expect(summarizeEntryStatus(['withdrawn'])).toBe('withdrawn');
  });
  it('aucun engagement → undefined', () => {
    expect(summarizeEntryStatus([])).toBeUndefined();
  });
});

describe('CompetitionsService', () => {
  describe('createCompetition', () => {
    it('crée une compétition draft par défaut, dates converties', async () => {
      const prisma = prismaMock();
      prisma.competition.create.mockResolvedValue(competitionRow());
      const result = await service(prisma).createCompetition('c-1', {
        name: 'Meeting de printemps',
        startDate: '2026-07-01',
      });

      const arg = prisma.competition.create.mock.calls[0][0];
      expect(arg.data.coachId).toBe('c-1');
      expect(arg.data.status).toBe(CompetitionStatus.Draft);
      expect(arg.data.startDate).toEqual(new Date('2026-07-01'));
      expect(result).toMatchObject({ id: 'k-1', coachId: 'c-1', status: 'draft' });
    });

    it('400 si endDate précède startDate (garde applicative, pas la contrainte DB)', async () => {
      const prisma = prismaMock();
      await expect(
        service(prisma).createCompetition('c-1', {
          name: 'Meeting',
          startDate: '2026-07-05',
          endDate: '2026-07-01',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.competition.create).not.toHaveBeenCalled();
    });
  });

  describe('listCompetitions', () => {
    it('coach : scope sur ses compétitions non supprimées', async () => {
      const prisma = prismaMock();
      prisma.competition.findMany.mockResolvedValue([competitionRow()]);
      prisma.competition.count.mockResolvedValue(1);
      const page = await service(prisma).listCompetitions(COACH, baseQuery());

      const where = prisma.competition.findMany.mock.calls[0][0].where;
      expect(where).toEqual({ coachId: 'c-1', deletedAt: null });
      expect(page.meta).toEqual({ total: 1, page: 1, limit: 20, hasNext: false });
    });

    it('athlète : scope sur les compétitions où il est engagé', async () => {
      const prisma = prismaMock();
      prisma.competition.findMany.mockResolvedValue([]);
      prisma.competition.count.mockResolvedValue(0);
      await service(prisma).listCompetitions(ATHLETE, baseQuery());

      const call = prisma.competition.findMany.mock.calls[0][0];
      expect(call.where).toEqual({
        deletedAt: null,
        entries: { some: { athleteId: 'a-1', deletedAt: null } },
      });
      // Embarque les engagements actifs de l'athlète pour exposer son statut (TLX-92).
      expect(call.include).toEqual({
        entries: { where: { athleteId: 'a-1', deletedAt: null }, select: { status: true } },
      });
    });

    it('athlète : expose le statut d’engagement résumé sur chaque compétition (TLX-92)', async () => {
      const prisma = prismaMock();
      prisma.competition.findMany.mockResolvedValue([
        competitionRow({ entries: [{ status: 'engaged' }, { status: 'confirmed' }] }),
        competitionRow({ id: 'k-2', entries: [] }),
      ]);
      prisma.competition.count.mockResolvedValue(2);
      const page = await service(prisma).listCompetitions(ATHLETE, baseQuery());

      // Résumé : confirmed l'emporte sur engaged.
      expect(page.data[0].viewerEntryStatus).toBe('confirmed');
      // Aucun engagement (cas limite) → indéfini.
      expect(page.data[1].viewerEntryStatus).toBeUndefined();
    });

    it('coach : n’embarque pas les engagements (badge = statut compétition)', async () => {
      const prisma = prismaMock();
      prisma.competition.findMany.mockResolvedValue([competitionRow()]);
      prisma.competition.count.mockResolvedValue(1);
      const page = await service(prisma).listCompetitions(COACH, baseQuery());

      expect(prisma.competition.findMany.mock.calls[0][0].include).toBeUndefined();
      expect(page.data[0].viewerEntryStatus).toBeUndefined();
    });

    it('applique le filtre status', async () => {
      const prisma = prismaMock();
      prisma.competition.findMany.mockResolvedValue([]);
      prisma.competition.count.mockResolvedValue(0);
      const q = Object.assign(baseQuery(), { status: CompetitionStatus.Published });
      await service(prisma).listCompetitions(COACH, q);

      const where = prisma.competition.findMany.mock.calls[0][0].where;
      expect(where.status).toBe('published');
    });
  });

  describe('getCompetition', () => {
    it('404 si la compétition est introuvable', async () => {
      const prisma = prismaMock();
      prisma.competition.findFirst.mockResolvedValue(null);
      await expect(service(prisma).getCompetition(COACH, 'k-x')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('403 si un autre coach tente de lire', async () => {
      const prisma = prismaMock();
      prisma.competition.findFirst.mockResolvedValue(competitionRow({ coachId: 'c-2' }));
      await expect(service(prisma).getCompetition(COACH, 'k-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('403 si un athlète non engagé tente de lire', async () => {
      const prisma = prismaMock();
      prisma.competition.findFirst.mockResolvedValue(competitionRow());
      prisma.competitionEntry.findMany.mockResolvedValue([]);
      await expect(service(prisma).getCompetition(ATHLETE, 'k-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('athlète engagé : lecture autorisée + statut d’engagement résumé (TLX-92)', async () => {
      const prisma = prismaMock();
      prisma.competition.findFirst.mockResolvedValue(competitionRow());
      prisma.competitionEntry.findMany.mockResolvedValue([
        { status: 'withdrawn' },
        { status: 'engaged' },
      ]);
      const dto = await service(prisma).getCompetition(ATHLETE, 'k-1');
      expect(dto.id).toBe('k-1');
      // engaged l'emporte sur withdrawn.
      expect(dto.viewerEntryStatus).toBe('engaged');
    });
  });

  describe('updateCompetition', () => {
    it('vérifie l’ownership puis normalise endDate à null si effacée', async () => {
      const prisma = prismaMock();
      const ownership = ownershipMock();
      prisma.competition.update.mockResolvedValue(competitionRow());
      await service(prisma, ownership).updateCompetition('c-1', 'k-1', { endDate: undefined });
      expect(ownership.assertCompetitionOwnedByCoach).toHaveBeenCalledWith('c-1', 'k-1');
    });

    it('endDate fournie est convertie en Date', async () => {
      const prisma = prismaMock();
      prisma.competition.findUniqueOrThrow.mockResolvedValue({
        startDate: new Date('2026-07-01'),
        endDate: null,
      });
      prisma.competition.update.mockResolvedValue(competitionRow());
      await service(prisma).updateCompetition('c-1', 'k-1', { endDate: '2026-07-03' });
      const data = prisma.competition.update.mock.calls[0][0].data;
      expect(data.endDate).toEqual(new Date('2026-07-03'));
    });

    it('400 si la endDate fournie précède la startDate existante (valeurs effectives)', async () => {
      const prisma = prismaMock();
      prisma.competition.findUniqueOrThrow.mockResolvedValue({
        startDate: new Date('2026-07-05'),
        endDate: null,
      });
      await expect(
        service(prisma).updateCompetition('c-1', 'k-1', { endDate: '2026-07-01' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.competition.update).not.toHaveBeenCalled();
    });
  });

  describe('deleteCompetition', () => {
    it('soft-delete après ownership', async () => {
      const prisma = prismaMock();
      const ownership = ownershipMock();
      prisma.competition.update.mockResolvedValue(competitionRow());
      await service(prisma, ownership).deleteCompetition('c-1', 'k-1');
      expect(ownership.assertCompetitionOwnedByCoach).toHaveBeenCalledWith('c-1', 'k-1');
      const data = prisma.competition.update.mock.calls[0][0].data;
      expect(data.deletedAt).toBeInstanceOf(Date);
    });
  });
});
