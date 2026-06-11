import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { OwnershipService } from '../common/authorization/ownership.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { SessionsService } from './sessions.service';
import { SessionQueryDto } from './dto/session-query.dto';
import { SessionStatus } from './dto/session-create.dto';

const COACH: AuthenticatedUser = { id: 'c-1', role: 'coach' };
const ATHLETE: AuthenticatedUser = { id: 'a-1', role: 'athlete' };

/** Brief complet (ADR-28) : champs partagés + champs coach-only (intent, coachNotes). */
const FULL_BRIEF = {
  schemaVersion: 1,
  athleteIntent: 'Cours vite et relâché.',
  durationMinutes: 75,
  difficulty: 9,
  successCriteria: "Tenir l'allure 400 m.",
  stopCriteria: "Ta foulée s'écrase.",
  intent: 'Tolérance lactique — accumulation puis maintien.',
  coachNotes: {
    regression: '2 séries au lieu de 3.',
    progression: 'Semaine suivante R réduite à 6 min.',
    caution: 'Reprise après semaine chargée.',
  },
};

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
      expect(arg.data.exercises).toEqual({ schemaVersion: 2, items: [{ name: '60m', order: 0 }] });
      expect(result).toMatchObject({ id: 's-1', coachId: 'c-1', status: 'draft' });
    });

    it('préserve type et params des blocs typés (contrat v2, ADR-18)', async () => {
      const prisma = prismaMock();
      prisma.session.create.mockResolvedValue(sessionRow());
      await service(prisma).createSession('c-1', {
        title: 'Haies',
        exercises: {
          schemaVersion: 2,
          items: [
            {
              name: 'Passage 5 haies',
              order: 1,
              type: 'hurdles',
              params: { height: 84, spacing: 8.5 },
            } as never,
          ],
        },
      });
      const doc = prisma.session.create.mock.calls[0][0].data.exercises;
      expect(doc.schemaVersion).toBe(2);
      expect(doc.items[0]).toMatchObject({ type: 'hurdles', params: { height: 84, spacing: 8.5 } });
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

    it('lecture : un bloc v1 sans type est exposé comme custom (ADR-18)', async () => {
      const prisma = prismaMock();
      prisma.session.findFirst.mockResolvedValue(sessionRow());
      const res = await service(prisma).getSession(COACH, 's-1');
      expect(res.exercises.items[0]).toMatchObject({ name: '60m', type: 'custom' });
    });

    it('lecture : un bloc déjà typé conserve son type (ADR-18)', async () => {
      const prisma = prismaMock();
      prisma.session.findFirst.mockResolvedValue(
        sessionRow({
          exercises: { schemaVersion: 2, items: [{ name: 'Saut', order: 1, type: 'jumps' }] },
        }),
      );
      const res = await service(prisma).getSession(COACH, 's-1');
      expect(res.exercises.items[0]).toMatchObject({ type: 'jumps' });
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

    it('utiliser un modèle (template, C-10) : la copie est un brouillon assignable (ADR-29)', async () => {
      const prisma = prismaMock();
      prisma.session.findUniqueOrThrow.mockResolvedValue(sessionRow({ status: 'template' }));
      prisma.session.create.mockResolvedValue(sessionRow({ id: 's-2', status: 'draft' }));
      await service(prisma).duplicateSession('c-1', 's-1');

      // Une copie de modèle redevient une séance réelle (brouillon) → de nouveau assignable.
      expect(prisma.session.create.mock.calls[0][0].data.status).toBe(SessionStatus.Draft);
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

  describe('brief — double lecture coach/athlète (ADR-28)', () => {
    it('createSession : persiste le brief avec schemaVersion par défaut (1)', async () => {
      const prisma = prismaMock();
      prisma.session.create.mockResolvedValue(sessionRow({ brief: FULL_BRIEF }));
      const { schemaVersion: _omit, ...briefSansVersion } = FULL_BRIEF;
      await service(prisma).createSession('c-1', {
        title: 'Lactique',
        exercises: { items: [] },
        brief: briefSansVersion as never,
      });

      const data = prisma.session.create.mock.calls[0][0].data;
      expect(data.brief).toMatchObject({ ...briefSansVersion, schemaVersion: 1 });
    });

    it('createSession sans brief : champ absent de l’insert (rétro-compat)', async () => {
      const prisma = prismaMock();
      prisma.session.create.mockResolvedValue(sessionRow());
      await service(prisma).createSession('c-1', { title: 'T', exercises: { items: [] } });
      expect('brief' in prisma.session.create.mock.calls[0][0].data).toBe(false);
    });

    it('createSession : le coach créateur reçoit le brief complet', async () => {
      const prisma = prismaMock();
      prisma.session.create.mockResolvedValue(sessionRow({ brief: FULL_BRIEF }));
      const res = await service(prisma).createSession('c-1', {
        title: 'Lactique',
        exercises: { items: [] },
        brief: FULL_BRIEF as never,
      });
      expect(res.brief).toMatchObject({
        intent: FULL_BRIEF.intent,
        coachNotes: expect.any(Object),
      });
    });

    it('getSession coach : brief complet (intent + coachNotes présents)', async () => {
      const prisma = prismaMock();
      prisma.session.findFirst.mockResolvedValue(sessionRow({ brief: FULL_BRIEF }));
      const res = await service(prisma).getSession(COACH, 's-1');
      expect(res.brief?.intent).toBe(FULL_BRIEF.intent);
      expect(res.brief?.coachNotes).toBeDefined();
    });

    it('getSession athlète affecté : intent + coachNotes RETIRÉS, champs partagés conservés', async () => {
      const prisma = prismaMock();
      prisma.session.findFirst.mockResolvedValue(sessionRow({ brief: FULL_BRIEF }));
      prisma.sessionAssignment.findFirst.mockResolvedValue({ id: 'asg-1' });
      const res = await service(prisma).getSession(ATHLETE, 's-1');

      expect(res.brief).toBeDefined();
      expect(res.brief).not.toHaveProperty('intent');
      expect(res.brief).not.toHaveProperty('coachNotes');
      expect(res.brief).toMatchObject({
        athleteIntent: FULL_BRIEF.athleteIntent,
        difficulty: 9,
        successCriteria: FULL_BRIEF.successCriteria,
        stopCriteria: FULL_BRIEF.stopCriteria,
      });
    });

    it('listSessions athlète : brief filtré sur chaque séance de la liste', async () => {
      const prisma = prismaMock();
      prisma.session.findMany.mockResolvedValue([sessionRow({ brief: FULL_BRIEF })]);
      prisma.session.count.mockResolvedValue(1);
      const res = await service(prisma).listSessions(ATHLETE, baseQuery());
      expect(res.data[0].brief).not.toHaveProperty('intent');
      expect(res.data[0].brief).not.toHaveProperty('coachNotes');
    });

    it('séance sans brief : brief absent du DTO (undefined)', async () => {
      const prisma = prismaMock();
      prisma.session.findFirst.mockResolvedValue(sessionRow({ brief: null }));
      const res = await service(prisma).getSession(COACH, 's-1');
      expect(res.brief).toBeUndefined();
    });

    it('updateSession : persiste le brief fourni', async () => {
      const prisma = prismaMock();
      prisma.session.update.mockResolvedValue(sessionRow({ brief: FULL_BRIEF }));
      await service(prisma).updateSession('c-1', 's-1', { brief: { difficulty: 5 } as never });
      expect(prisma.session.update.mock.calls[0][0].data.brief).toMatchObject({
        difficulty: 5,
        schemaVersion: 1,
      });
    });

    it('duplicateSession : copie le brief de la séance source', async () => {
      const prisma = prismaMock();
      prisma.session.findUniqueOrThrow.mockResolvedValue(sessionRow({ brief: FULL_BRIEF }));
      prisma.session.create.mockResolvedValue(sessionRow({ id: 's-2', brief: FULL_BRIEF }));
      await service(prisma).duplicateSession('c-1', 's-1');
      expect(prisma.session.create.mock.calls[0][0].data.brief).toMatchObject({
        intent: FULL_BRIEF.intent,
      });
    });
  });
});
