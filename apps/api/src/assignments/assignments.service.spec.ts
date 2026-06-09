import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { OwnershipService } from '../common/authorization/ownership.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { AssignmentsService } from './assignments.service';
import { AssignmentQueryDto } from './dto/assignment-query.dto';
import { AssignmentStatus } from './dto/assignment.dto';

const COACH: AuthenticatedUser = { id: 'c-1', role: 'coach' };
const ATHLETE: AuthenticatedUser = { id: 'a-1', role: 'athlete' };

function sessionRow(over: Record<string, unknown> = {}) {
  return {
    id: 's-1',
    coachId: 'c-1',
    title: 'Sprint',
    description: null,
    scheduledDate: null,
    status: 'published',
    exercises: { schemaVersion: 1, items: [] },
    exercisesSchemaVersion: 1,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    deletedAt: null,
    ...over,
  };
}

function assignmentRow(over: Record<string, unknown> = {}) {
  return {
    id: 'asg-1',
    sessionId: 's-1',
    athleteId: 'a-1',
    status: 'assigned',
    assignedAt: new Date('2026-01-02T00:00:00.000Z'),
    dueDate: null,
    createdAt: new Date('2026-01-02T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    deletedAt: null,
    ...over,
  };
}

function ownershipMock(over: Partial<OwnershipService> = {}): OwnershipService {
  return {
    assertSessionOwnedByCoach: jest.fn().mockResolvedValue(undefined),
    assertCoachLinkedToAthlete: jest.fn().mockResolvedValue(undefined),
    ...over,
  } as unknown as OwnershipService;
}

type PrismaMock = {
  sessionAssignment: Record<string, jest.Mock>;
  $transaction: jest.Mock;
};

function prismaMock(): PrismaMock {
  const mock: PrismaMock = {
    sessionAssignment: {
      findFirst: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn((arg: unknown) =>
      Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(mock),
    ),
  };
  return mock;
}

function service(prisma: PrismaMock, ownership = ownershipMock()): AssignmentsService {
  return new AssignmentsService(prisma as unknown as PrismaService, ownership);
}

const baseQuery = (): AssignmentQueryDto =>
  Object.assign(new AssignmentQueryDto(), { page: 1, limit: 20 });

describe('AssignmentsService', () => {
  describe('assignSession', () => {
    it('vérifie ownership + lien par athlète, puis crée les affectations manquantes', async () => {
      const prisma = prismaMock();
      const ownership = ownershipMock();
      prisma.sessionAssignment.findFirst.mockResolvedValue(null);
      prisma.sessionAssignment.create
        .mockResolvedValueOnce(assignmentRow({ id: 'x', athleteId: 'a-1' }))
        .mockResolvedValueOnce(assignmentRow({ id: 'y', athleteId: 'a-2' }));

      const res = await service(prisma, ownership).assignSession('c-1', 's-1', {
        athleteIds: ['a-1', 'a-2'],
        dueDate: '2026-07-10',
      });

      expect(ownership.assertSessionOwnedByCoach).toHaveBeenCalledWith('c-1', 's-1');
      expect(ownership.assertCoachLinkedToAthlete).toHaveBeenCalledTimes(2);
      expect(prisma.sessionAssignment.create).toHaveBeenCalledTimes(2);
      expect(prisma.sessionAssignment.create.mock.calls[0][0].data.dueDate).toEqual(
        new Date('2026-07-10'),
      );
      expect(res.data).toHaveLength(2);
    });

    it('idempotent : renvoie l’affectation existante sans recréer', async () => {
      const prisma = prismaMock();
      prisma.sessionAssignment.findFirst.mockResolvedValue(assignmentRow());
      const res = await service(prisma).assignSession('c-1', 's-1', { athleteIds: ['a-1'] });

      expect(prisma.sessionAssignment.create).not.toHaveBeenCalled();
      expect(res.data[0].id).toBe('asg-1');
    });

    it('déduplique les athleteIds en doublon', async () => {
      const prisma = prismaMock();
      prisma.sessionAssignment.findFirst.mockResolvedValue(null);
      prisma.sessionAssignment.create.mockResolvedValue(assignmentRow());
      const res = await service(prisma).assignSession('c-1', 's-1', {
        athleteIds: ['a-1', 'a-1'],
      });
      expect(prisma.sessionAssignment.create).toHaveBeenCalledTimes(1);
      expect(res.data).toHaveLength(1);
    });

    it('403 si un athlète n’est pas lié au coach', async () => {
      const prisma = prismaMock();
      const ownership = ownershipMock({
        assertCoachLinkedToAthlete: jest.fn().mockRejectedValue(new ForbiddenException()),
      });
      await expect(
        service(prisma, ownership).assignSession('c-1', 's-1', { athleteIds: ['a-9'] }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.sessionAssignment.create).not.toHaveBeenCalled();
    });

    it('propage le refus d’ownership de séance', async () => {
      const prisma = prismaMock();
      const ownership = ownershipMock({
        assertSessionOwnedByCoach: jest.fn().mockRejectedValue(new NotFoundException()),
      });
      await expect(
        service(prisma, ownership).assignSession('c-1', 's-x', { athleteIds: ['a-1'] }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('listAssignments', () => {
    it('athlète : filtre sur ses propres affectations actives', async () => {
      const prisma = prismaMock();
      prisma.sessionAssignment.findMany.mockResolvedValue([
        { ...assignmentRow(), session: sessionRow() },
      ]);
      prisma.sessionAssignment.count.mockResolvedValue(1);
      const res = await service(prisma).listAssignments(ATHLETE, baseQuery());

      expect(prisma.sessionAssignment.findMany.mock.calls[0][0].where).toEqual({
        deletedAt: null,
        athleteId: 'a-1',
      });
      expect(res.data[0].session?.id).toBe('s-1');
    });

    it('coach : filtre sur les affectations de ses séances', async () => {
      const prisma = prismaMock();
      prisma.sessionAssignment.findMany.mockResolvedValue([]);
      prisma.sessionAssignment.count.mockResolvedValue(0);
      await service(prisma).listAssignments(COACH, baseQuery());

      expect(prisma.sessionAssignment.findMany.mock.calls[0][0].where).toEqual({
        deletedAt: null,
        session: { coachId: 'c-1' },
      });
    });

    it('applique le filtre status', async () => {
      const prisma = prismaMock();
      prisma.sessionAssignment.findMany.mockResolvedValue([]);
      prisma.sessionAssignment.count.mockResolvedValue(0);
      const q = Object.assign(baseQuery(), { status: AssignmentStatus.Completed });
      await service(prisma).listAssignments(ATHLETE, q);
      expect(prisma.sessionAssignment.findMany.mock.calls[0][0].where).toMatchObject({
        status: 'completed',
      });
    });
  });

  describe('getAssignment', () => {
    it('404 si introuvable', async () => {
      const prisma = prismaMock();
      prisma.sessionAssignment.findFirst.mockResolvedValue(null);
      await expect(service(prisma).getAssignment(COACH, 'x')).rejects.toThrow(NotFoundException);
    });

    it('athlète titulaire : autorisé', async () => {
      const prisma = prismaMock();
      prisma.sessionAssignment.findFirst.mockResolvedValue({
        ...assignmentRow(),
        session: sessionRow(),
      });
      const res = await service(prisma).getAssignment(ATHLETE, 'asg-1');
      expect(res.id).toBe('asg-1');
    });

    it('athlète non titulaire : 403', async () => {
      const prisma = prismaMock();
      prisma.sessionAssignment.findFirst.mockResolvedValue({
        ...assignmentRow({ athleteId: 'other' }),
        session: sessionRow(),
      });
      await expect(service(prisma).getAssignment(ATHLETE, 'asg-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('coach propriétaire de la séance : autorisé', async () => {
      const prisma = prismaMock();
      prisma.sessionAssignment.findFirst.mockResolvedValue({
        ...assignmentRow({ athleteId: 'a-1' }),
        session: sessionRow({ coachId: 'c-1' }),
      });
      const res = await service(prisma).getAssignment(COACH, 'asg-1');
      expect(res.id).toBe('asg-1');
    });

    it('coach d’une autre séance : 403', async () => {
      const prisma = prismaMock();
      prisma.sessionAssignment.findFirst.mockResolvedValue({
        ...assignmentRow(),
        session: sessionRow({ coachId: 'other' }),
      });
      await expect(service(prisma).getAssignment(COACH, 'asg-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
