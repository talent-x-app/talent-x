import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { OwnershipService } from '../common/authorization/ownership.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { SessionsService } from './sessions.service';
import { SessionQueryDto } from './dto/session-query.dto';
import { SessionStatus } from './dto/session-create.dto';

const COACH: AuthenticatedUser = { id: 'c-1', role: 'coach' };
const ATHLETE: AuthenticatedUser = { id: 'a-1', role: 'athlete' };

function sessionRow(over: Record<string, unknown> = {}) {
  return {
    id: 's-1',
    coachId: 'c-1',
    title: 'Sprint 6×60m',
    description: null,
    scheduledDate: null,
    status: 'draft',
    exercises: { schemaVersion: 1, items: [{ name: '60m', order: 0 }] },
    exercisesSchemaVersion: 1,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    deletedAt: null,
    ...over,
  };
}

function ownershipMock(over: Partial<OwnershipService> = {}): OwnershipService {
  return {
    assertSessionOwnedByCoach: jest.fn().mockResolvedValue(undefined),
    ...over,
  } as unknown as OwnershipService;
}

type PrismaMock = {
  session: Record<string, jest.Mock>;
  sessionAssignment: Record<string, jest.Mock>;
  $transaction: jest.Mock;
};

function prismaMock(): PrismaMock {
  const mock: PrismaMock = {
    session: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
    sessionAssignment: { findFirst: jest.fn() },
    $transaction: jest.fn((arg: unknown) =>
      Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(mock),
    ),
  };
  return mock;
}

function service(prisma: PrismaMock, ownership = ownershipMock()): SessionsService {
  return new SessionsService(prisma as unknown as PrismaService, ownership);
}

const baseQuery = (): SessionQueryDto =>
  Object.assign(new SessionQueryDto(), { page: 1, limit: 20 });

describe('SessionsService', () => {
  describe('createSession', () => {
    it('crée une séance draft par défaut avec exercices versionnés', async () => {
      const prisma = prismaMock();
      prisma.session.create.mockResolvedValue(sessionRow());
      const result = await service(prisma).createSession('c-1', {
        title: 'Sprint 6×60m',
        exercises: { items: [{ name: '60m', order: 0 }] },
      });

      const arg = prisma.session.create.mock.calls[0][0];
      expect(arg.data.coachId).toBe('c-1');
      expect(arg.data.status).toBe(SessionStatus.Draft);
      expect(arg.data.exercises).toEqual({ schemaVersion: 1, items: [{ name: '60m', order: 0 }] });
      expect(result).toMatchObject({ id: 's-1', coachId: 'c-1', status: 'draft' });
    });

    it('convertit scheduledDate (YYYY-MM-DD) en Date', async () => {
      const prisma = prismaMock();
      prisma.session.create.mockResolvedValue(sessionRow());
      await service(prisma).createSession('c-1', {
        title: 'T',
        scheduledDate: '2026-07-01',
        exercises: { items: [] },
      });
      expect(prisma.session.create.mock.calls[0][0].data.scheduledDate).toEqual(
        new Date('2026-07-01'),
      );
    });
  });

  describe('listSessions', () => {
    it('coach : filtre sur ses propres séances non supprimées', async () => {
      const prisma = prismaMock();
      prisma.session.findMany.mockResolvedValue([sessionRow()]);
      prisma.session.count.mockResolvedValue(1);
      const res = await service(prisma).listSessions(COACH, baseQuery());

      expect(prisma.session.findMany.mock.calls[0][0].where).toEqual({
        coachId: 'c-1',
        deletedAt: null,
      });
      expect(res.data).toHaveLength(1);
      expect(res.meta).toMatchObject({ total: 1, page: 1, limit: 20, hasNext: false });
    });

    it('athlète : filtre sur les séances qui lui sont affectées', async () => {
      const prisma = prismaMock();
      prisma.session.findMany.mockResolvedValue([]);
      prisma.session.count.mockResolvedValue(0);
      await service(prisma).listSessions(ATHLETE, baseQuery());

      expect(prisma.session.findMany.mock.calls[0][0].where).toEqual({
        deletedAt: null,
        assignments: { some: { athleteId: 'a-1', deletedAt: null } },
      });
    });

    it('applique le filtre status quand fourni', async () => {
      const prisma = prismaMock();
      prisma.session.findMany.mockResolvedValue([]);
      prisma.session.count.mockResolvedValue(0);
      const q = Object.assign(baseQuery(), { status: SessionStatus.Published });
      await service(prisma).listSessions(COACH, q);

      expect(prisma.session.findMany.mock.calls[0][0].where).toMatchObject({
        status: 'published',
      });
    });
  });

  describe('getSession', () => {
    it('404 si la séance est introuvable', async () => {
      const prisma = prismaMock();
      prisma.session.findFirst.mockResolvedValue(null);
      await expect(service(prisma).getSession(COACH, 's-x')).rejects.toThrow(NotFoundException);
    });

    it('coach propriétaire : lecture autorisée', async () => {
      const prisma = prismaMock();
      prisma.session.findFirst.mockResolvedValue(sessionRow());
      const res = await service(prisma).getSession(COACH, 's-1');
      expect(res.id).toBe('s-1');
    });

    it('coach non propriétaire : 403', async () => {
      const prisma = prismaMock();
      prisma.session.findFirst.mockResolvedValue(sessionRow({ coachId: 'other' }));
      await expect(service(prisma).getSession(COACH, 's-1')).rejects.toThrow(ForbiddenException);
    });

    it('athlète affecté : lecture autorisée', async () => {
      const prisma = prismaMock();
      prisma.session.findFirst.mockResolvedValue(sessionRow());
      prisma.sessionAssignment.findFirst.mockResolvedValue({ id: 'asg-1' });
      const res = await service(prisma).getSession(ATHLETE, 's-1');
      expect(res.id).toBe('s-1');
    });

    it('athlète non affecté : 403', async () => {
      const prisma = prismaMock();
      prisma.session.findFirst.mockResolvedValue(sessionRow());
      prisma.sessionAssignment.findFirst.mockResolvedValue(null);
      await expect(service(prisma).getSession(ATHLETE, 's-1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('updateSession', () => {
    it('vérifie ownership puis applique un PATCH partiel', async () => {
      const prisma = prismaMock();
      const ownership = ownershipMock();
      prisma.session.update.mockResolvedValue(sessionRow({ title: 'Nouveau' }));
      await service(prisma, ownership).updateSession('c-1', 's-1', { title: 'Nouveau' });

      expect(ownership.assertSessionOwnedByCoach).toHaveBeenCalledWith('c-1', 's-1');
      expect(prisma.session.update.mock.calls[0][0].data).toEqual({ title: 'Nouveau' });
    });

    it('met scheduledDate à null quand explicitement vidée', async () => {
      const prisma = prismaMock();
      prisma.session.update.mockResolvedValue(sessionRow());
      await service(prisma).updateSession('c-1', 's-1', { scheduledDate: undefined });
      // undefined → champ absent (non touché)
      expect(prisma.session.update.mock.calls[0][0].data).toEqual({});
    });

    it('propage le refus d’ownership', async () => {
      const prisma = prismaMock();
      const ownership = ownershipMock({
        assertSessionOwnedByCoach: jest.fn().mockRejectedValue(new ForbiddenException()),
      });
      await expect(
        service(prisma, ownership).updateSession('c-1', 's-1', { title: 'X' }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.session.update).not.toHaveBeenCalled();
    });
  });

  describe('deleteSession', () => {
    it('soft-delete après ownership', async () => {
      const prisma = prismaMock();
      const ownership = ownershipMock();
      prisma.session.update.mockResolvedValue(sessionRow());
      await service(prisma, ownership).deleteSession('c-1', 's-1');

      expect(ownership.assertSessionOwnedByCoach).toHaveBeenCalledWith('c-1', 's-1');
      expect(prisma.session.update.mock.calls[0][0].data.deletedAt).toBeInstanceOf(Date);
    });
  });

  describe('duplicateSession', () => {
    it('crée un brouillon copié, titre suffixé et date remise à zéro', async () => {
      const prisma = prismaMock();
      prisma.session.findUniqueOrThrow.mockResolvedValue(
        sessionRow({ status: 'published', scheduledDate: new Date('2026-07-01') }),
      );
      prisma.session.create.mockResolvedValue(sessionRow({ id: 's-2' }));
      const res = await service(prisma).duplicateSession('c-1', 's-1');

      const data = prisma.session.create.mock.calls[0][0].data;
      expect(data.title).toBe('Sprint 6×60m (copie)');
      expect(data.status).toBe(SessionStatus.Draft);
      expect(data.scheduledDate).toBeUndefined();
      expect(res.id).toBe('s-2');
    });
  });

  describe('archiveSession', () => {
    it('passe le status à archived', async () => {
      const prisma = prismaMock();
      prisma.session.update.mockResolvedValue(sessionRow({ status: 'archived' }));
      const res = await service(prisma).archiveSession('c-1', 's-1');

      expect(prisma.session.update.mock.calls[0][0].data).toEqual({
        status: SessionStatus.Archived,
      });
      expect(res.status).toBe('archived');
    });
  });
});
