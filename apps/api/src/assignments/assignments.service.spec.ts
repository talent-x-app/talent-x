import {
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { OwnershipService } from '../common/authorization/ownership.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import type { NotificationQueueService } from '../jobs/notification-queue.service';
import { AssignmentsService } from './assignments.service';
import { AssignmentQueryDto } from './dto/assignment-query.dto';
import { AssignmentStatus } from './dto/assignment.dto';

const COACH: AuthenticatedUser = { id: 'c-1', role: 'coach' };
const ATHLETE: AuthenticatedUser = { id: 'a-1', role: 'athlete' };

/** Brief complet (ADR-28) embarqué dans la séance d'une affectation. */
const FULL_BRIEF = {
  schemaVersion: 1,
  athleteIntent: 'Cours relâché.',
  difficulty: 8,
  intent: 'Notes internes du coach.',
  coachNotes: { caution: 'Surveiller les appuis.' },
};

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
    assertGroupOwnedByCoach: jest.fn().mockResolvedValue(undefined),
    ...over,
  } as unknown as OwnershipService;
}

type PrismaMock = {
  sessionAssignment: Record<string, jest.Mock>;
  session: Record<string, jest.Mock>;
  groupMember: Record<string, jest.Mock>;
  groupAssignment: Record<string, jest.Mock>;
  $transaction: jest.Mock;
};

function prismaMock(): PrismaMock {
  const mock: PrismaMock = {
    sessionAssignment: {
      findFirst: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    // Garde-fou ADR-29 : statut de la séance lu avant assignation (défaut = assignable).
    // Récurrence (ADR-35) : duplication serveur des occurrences 2..N.
    session: {
      findUnique: jest.fn().mockResolvedValue({ status: 'published' }),
      findUniqueOrThrow: jest.fn().mockResolvedValue(sessionRow()),
      create: jest.fn(),
    },
    // Résolution de groupe (ADR-30) — défauts : aucun membre, aucune affectation de groupe.
    groupMember: { findMany: jest.fn().mockResolvedValue([]) },
    groupAssignment: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn((arg: unknown) =>
      Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(mock),
    ),
  };
  return mock;
}

function queueMock(): NotificationQueueService {
  return { enqueue: jest.fn().mockResolvedValue(undefined) } as unknown as NotificationQueueService;
}

function service(
  prisma: PrismaMock,
  ownership = ownershipMock(),
  queue = queueMock(),
): AssignmentsService {
  return new AssignmentsService(prisma as unknown as PrismaService, ownership, queue);
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

    it('idempotent : renvoie l’affectation existante sans recréer ni notifier', async () => {
      const prisma = prismaMock();
      const queue = queueMock();
      prisma.sessionAssignment.findFirst.mockResolvedValue(assignmentRow());
      const res = await service(prisma, ownershipMock(), queue).assignSession('c-1', 's-1', {
        athleteIds: ['a-1'],
      });

      expect(prisma.sessionAssignment.create).not.toHaveBeenCalled();
      expect(queue.enqueue).not.toHaveBeenCalled();
      expect(res.data[0].id).toBe('asg-1');
    });

    it('notifie chaque athlète nouvellement affecté (session_assigned, ADR-22)', async () => {
      const prisma = prismaMock();
      const queue = queueMock();
      prisma.sessionAssignment.findFirst.mockResolvedValue(null);
      prisma.sessionAssignment.create
        .mockResolvedValueOnce(assignmentRow({ id: 'x', athleteId: 'a-1' }))
        .mockResolvedValueOnce(assignmentRow({ id: 'y', athleteId: 'a-2' }));

      await service(prisma, ownershipMock(), queue).assignSession('c-1', 's-1', {
        athleteIds: ['a-1', 'a-2'],
      });

      expect(queue.enqueue).toHaveBeenCalledTimes(2);
      expect(queue.enqueue).toHaveBeenCalledWith(
        { type: 'session_assigned', recipientUserId: 'a-1', resourceId: 'x' },
        'session_assigned--x',
      );
      expect(queue.enqueue).toHaveBeenCalledWith(
        { type: 'session_assigned', recipientUserId: 'a-2', resourceId: 'y' },
        'session_assigned--y',
      );
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

    it('422 SESSION_NOT_ASSIGNABLE si la séance est un modèle (template, ADR-29)', async () => {
      const prisma = prismaMock();
      const queue = queueMock();
      prisma.session.findUnique.mockResolvedValue({ status: 'template' });
      prisma.sessionAssignment.findFirst.mockResolvedValue(null);

      await expect(
        service(prisma, ownershipMock(), queue).assignSession('c-1', 's-1', {
          athleteIds: ['a-1'],
        }),
      ).rejects.toMatchObject({
        constructor: UnprocessableEntityException,
        response: { error: 'SESSION_NOT_ASSIGNABLE' },
      });
      // Aucune affectation créée ni notification émise.
      expect(prisma.sessionAssignment.create).not.toHaveBeenCalled();
      expect(queue.enqueue).not.toHaveBeenCalled();
    });
  });

  describe('assignSession — par groupe (ADR-30)', () => {
    it('422 ASSIGN_TARGET_REQUIRED si ni athleteIds ni groupIds', async () => {
      const prisma = prismaMock();
      await expect(service(prisma).assignSession('c-1', 's-1', {})).rejects.toMatchObject({
        constructor: UnprocessableEntityException,
        response: { error: 'ASSIGN_TARGET_REQUIRED' },
      });
      expect(prisma.sessionAssignment.create).not.toHaveBeenCalled();
    });

    it('résout le groupe vers ses membres actifs + crée une affectation par membre (provenance)', async () => {
      const prisma = prismaMock();
      const ownership = ownershipMock();
      prisma.groupAssignment.create.mockResolvedValue({ id: 'ga-1' });
      prisma.groupMember.findMany.mockResolvedValue([{ athleteId: 'a-1' }, { athleteId: 'a-2' }]);
      prisma.sessionAssignment.findFirst.mockResolvedValue(null);
      prisma.sessionAssignment.create
        .mockResolvedValueOnce(assignmentRow({ id: 'x', athleteId: 'a-1' }))
        .mockResolvedValueOnce(assignmentRow({ id: 'y', athleteId: 'a-2' }));

      const res = await service(prisma, ownership).assignSession('c-1', 's-1', {
        groupIds: ['g-1'],
      });

      expect(ownership.assertGroupOwnedByCoach).toHaveBeenCalledWith('c-1', 'g-1');
      expect(prisma.groupAssignment.create).toHaveBeenCalledTimes(1);
      expect(prisma.sessionAssignment.create).toHaveBeenCalledTimes(2);
      // Provenance posée sur chaque affectation matérialisée.
      expect(prisma.sessionAssignment.create.mock.calls[0][0].data.groupAssignmentId).toBe('ga-1');
      expect(res.data).toHaveLength(2);
    });

    it('réutilise une affectation de groupe active (idempotent, pas de doublon)', async () => {
      const prisma = prismaMock();
      prisma.groupAssignment.findFirst.mockResolvedValue({ id: 'ga-existing' });
      prisma.groupMember.findMany.mockResolvedValue([{ athleteId: 'a-1' }]);
      prisma.sessionAssignment.findFirst.mockResolvedValue(null);
      prisma.sessionAssignment.create.mockResolvedValue(
        assignmentRow({ id: 'x', athleteId: 'a-1' }),
      );

      await service(prisma).assignSession('c-1', 's-1', { groupIds: ['g-1'] });

      expect(prisma.groupAssignment.create).not.toHaveBeenCalled();
      expect(prisma.sessionAssignment.create.mock.calls[0][0].data.groupAssignmentId).toBe(
        'ga-existing',
      );
    });

    it('athlète explicite ∩ membre du groupe : affecté une seule fois, provenance individuelle (null)', async () => {
      const prisma = prismaMock();
      prisma.groupAssignment.create.mockResolvedValue({ id: 'ga-1' });
      prisma.groupMember.findMany.mockResolvedValue([{ athleteId: 'a-1' }]);
      prisma.sessionAssignment.findFirst.mockResolvedValue(null);
      prisma.sessionAssignment.create.mockResolvedValue(
        assignmentRow({ id: 'x', athleteId: 'a-1' }),
      );

      const res = await service(prisma).assignSession('c-1', 's-1', {
        athleteIds: ['a-1'],
        groupIds: ['g-1'],
      });

      expect(prisma.sessionAssignment.create).toHaveBeenCalledTimes(1);
      expect(prisma.sessionAssignment.create.mock.calls[0][0].data.groupAssignmentId).toBeNull();
      expect(res.data).toHaveLength(1);
    });
  });

  describe('assignSession — récurrence (ADR-35)', () => {
    it('matérialise N occurrences : occ.1 = séance d’origine, occ.2..N = duplications datées', async () => {
      const prisma = prismaMock();
      // Toujours « créé » (séances distinctes par occurrence).
      prisma.sessionAssignment.findFirst.mockResolvedValue(null);
      let n = 0;
      prisma.sessionAssignment.create.mockImplementation(({ data }) =>
        Promise.resolve(
          assignmentRow({ id: `asg-${++n}`, sessionId: data.sessionId, dueDate: data.dueDate }),
        ),
      );
      prisma.session.create
        .mockResolvedValueOnce({ id: 's-occ-2' })
        .mockResolvedValueOnce({ id: 's-occ-3' });

      // 2026-06-09 mardi → 3 occurrences jusqu'au 2026-06-23.
      const res = await service(prisma).assignSession('c-1', 's-1', {
        athleteIds: ['a-1'],
        dueDate: '2026-06-09',
        recurrence: { frequency: 'weekly', until: '2026-06-23' } as never,
      });

      // 3 occurrences × 1 athlète.
      expect(res.data).toHaveLength(3);
      // 2 duplications serveur (occurrences 2 et 3) au contenu identique.
      expect(prisma.session.create).toHaveBeenCalledTimes(2);
      expect(prisma.session.create.mock.calls[0][0].data).toMatchObject({
        coachId: 'c-1',
        title: 'Sprint',
        status: 'published',
      });
      // Occurrence 1 portée par la séance d'origine, occ. 2/3 par les copies.
      const createdSessionIds = prisma.sessionAssignment.create.mock.calls.map(
        (c) => c[0].data.sessionId,
      );
      expect(createdSessionIds).toEqual(['s-1', 's-occ-2', 's-occ-3']);
      // Dates espacées de 7 jours.
      const dueDates = prisma.sessionAssignment.create.mock.calls.map((c) =>
        c[0].data.dueDate.toISOString().slice(0, 10),
      );
      expect(dueDates).toEqual(['2026-06-09', '2026-06-16', '2026-06-23']);
    });

    it('une seule notification par athlète pour toute la série (occurrence 1)', async () => {
      const prisma = prismaMock();
      const queue = queueMock();
      prisma.sessionAssignment.findFirst.mockResolvedValue(null);
      let n = 0;
      prisma.sessionAssignment.create.mockImplementation(({ data }) =>
        Promise.resolve(
          assignmentRow({ id: `asg-${++n}`, athleteId: data.athleteId, sessionId: data.sessionId }),
        ),
      );
      prisma.session.create.mockResolvedValue({ id: 's-occ' });

      await service(prisma, ownershipMock(), queue).assignSession('c-1', 's-1', {
        athleteIds: ['a-1'],
        dueDate: '2026-06-09',
        recurrence: { frequency: 'weekly', until: '2026-06-16' } as never,
      });

      // 2 occurrences créées mais 1 seule notification (athlète a-1, occurrence 1).
      expect(queue.enqueue).toHaveBeenCalledTimes(1);
      expect(queue.enqueue).toHaveBeenCalledWith(
        { type: 'session_assigned', recipientUserId: 'a-1', resourceId: 'asg-1' },
        'session_assigned--asg-1',
      );
    });

    it('422 RECURRENCE_REQUIRES_DUE_DATE si recurrence sans dueDate', async () => {
      const prisma = prismaMock();
      await expect(
        service(prisma).assignSession('c-1', 's-1', {
          athleteIds: ['a-1'],
          recurrence: { frequency: 'weekly', until: '2026-06-23' } as never,
        }),
      ).rejects.toMatchObject({
        constructor: UnprocessableEntityException,
        response: { error: 'RECURRENCE_REQUIRES_DUE_DATE' },
      });
      expect(prisma.sessionAssignment.create).not.toHaveBeenCalled();
    });

    it('422 INVALID_RECURRENCE si until < dueDate', async () => {
      const prisma = prismaMock();
      await expect(
        service(prisma).assignSession('c-1', 's-1', {
          athleteIds: ['a-1'],
          dueDate: '2026-06-09',
          recurrence: { frequency: 'weekly', until: '2026-06-08' } as never,
        }),
      ).rejects.toMatchObject({
        constructor: UnprocessableEntityException,
        response: { error: 'INVALID_RECURRENCE' },
      });
      expect(prisma.sessionAssignment.create).not.toHaveBeenCalled();
    });

    it('422 RECURRENCE_TOO_LONG au-delà de 52 occurrences', async () => {
      const prisma = prismaMock();
      await expect(
        service(prisma).assignSession('c-1', 's-1', {
          athleteIds: ['a-1'],
          dueDate: '2026-01-06',
          recurrence: { frequency: 'weekly', until: '2027-06-09' } as never,
        }),
      ).rejects.toMatchObject({
        constructor: UnprocessableEntityException,
        response: { error: 'RECURRENCE_TOO_LONG' },
      });
      expect(prisma.sessionAssignment.create).not.toHaveBeenCalled();
    });
  });

  describe('unassignGroup (ADR-30)', () => {
    it('soft-delete l’affectation de groupe + les affectations de provenance non commencées', async () => {
      const prisma = prismaMock();
      const ownership = ownershipMock();
      prisma.groupAssignment.findFirst.mockResolvedValue({ id: 'ga-1' });

      await service(prisma, ownership).unassignGroup('c-1', 's-1', 'g-1');

      expect(ownership.assertSessionOwnedByCoach).toHaveBeenCalledWith('c-1', 's-1');
      expect(ownership.assertGroupOwnedByCoach).toHaveBeenCalledWith('c-1', 'g-1');
      expect(prisma.groupAssignment.update).toHaveBeenCalledWith({
        where: { id: 'ga-1' },
        data: { deletedAt: expect.any(Date) },
      });
      const updateArgs = prisma.sessionAssignment.updateMany.mock.calls[0][0];
      expect(updateArgs.where).toMatchObject({ groupAssignmentId: 'ga-1', status: 'assigned' });
      expect(updateArgs.data).toEqual({ deletedAt: expect.any(Date) });
    });

    it('404 si aucune affectation de groupe active', async () => {
      const prisma = prismaMock();
      prisma.groupAssignment.findFirst.mockResolvedValue(null);
      await expect(service(prisma).unassignGroup('c-1', 's-1', 'g-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.sessionAssignment.updateMany).not.toHaveBeenCalled();
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

    it('brief embarqué : athlète titulaire ne reçoit ni intent ni coachNotes (ADR-28)', async () => {
      const prisma = prismaMock();
      prisma.sessionAssignment.findFirst.mockResolvedValue({
        ...assignmentRow(),
        session: sessionRow({ brief: FULL_BRIEF }),
      });
      const res = await service(prisma).getAssignment(ATHLETE, 'asg-1');
      expect(res.session?.brief).toBeDefined();
      expect(res.session?.brief).not.toHaveProperty('intent');
      expect(res.session?.brief).not.toHaveProperty('coachNotes');
      expect(res.session?.brief).toMatchObject({ athleteIntent: 'Cours relâché.', difficulty: 8 });
    });

    it('brief embarqué : coach propriétaire reçoit le brief complet', async () => {
      const prisma = prismaMock();
      prisma.sessionAssignment.findFirst.mockResolvedValue({
        ...assignmentRow({ athleteId: 'a-1' }),
        session: sessionRow({ coachId: 'c-1', brief: FULL_BRIEF }),
      });
      const res = await service(prisma).getAssignment(COACH, 'asg-1');
      expect(res.session?.brief).toMatchObject({ intent: 'Notes internes du coach.' });
    });
  });

  describe('listAssignments — brief filtré par rôle (ADR-28)', () => {
    it('athlète : brief des séances listées sans intent ni coachNotes', async () => {
      const prisma = prismaMock();
      prisma.sessionAssignment.findMany.mockResolvedValue([
        { ...assignmentRow(), session: sessionRow({ brief: FULL_BRIEF }) },
      ]);
      prisma.sessionAssignment.count.mockResolvedValue(1);
      const res = await service(prisma).listAssignments(ATHLETE, baseQuery());
      expect(res.data[0].session?.brief).not.toHaveProperty('intent');
      expect(res.data[0].session?.brief).not.toHaveProperty('coachNotes');
    });
  });

  describe('patchAssignment (ADR-31 — cycle de vie)', () => {
    /** Pose findFirst (affectation + session) et un update « echo » des données. */
    function withAssignment(prisma: PrismaMock, over: Record<string, unknown> = {}) {
      const row = { ...assignmentRow(over), session: sessionRow({ coachId: 'c-1' }) };
      prisma.sessionAssignment.findFirst.mockResolvedValue(row);
      prisma.sessionAssignment.update = jest.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...row, ...data, session: row.session }),
      );
      return row;
    }

    it('coach replanifie : update dueDate (Date), 200', async () => {
      const prisma = prismaMock();
      withAssignment(prisma);
      const res = await service(prisma).patchAssignment(COACH, 'asg-1', { dueDate: '2026-08-01' });
      expect(prisma.sessionAssignment.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { dueDate: new Date('2026-08-01') } }),
      );
      expect(res.dueDate).toBe('2026-08-01');
    });

    it('coach replanifie dueDate=null : retire l’échéance', async () => {
      const prisma = prismaMock();
      withAssignment(prisma, { dueDate: new Date('2026-07-01') });
      await service(prisma).patchAssignment(COACH, 'asg-1', { dueDate: null });
      expect(prisma.sessionAssignment.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { dueDate: null } }),
      );
    });

    it('athlète démarre (assigned → in_progress)', async () => {
      const prisma = prismaMock();
      withAssignment(prisma, { status: 'assigned' } as never);
      const res = await service(prisma).patchAssignment(ATHLETE, 'asg-1', {
        status: 'in_progress',
      } as never);
      expect(res.status).toBe('in_progress');
    });

    it('athlète signale une indispo (skipped + motif)', async () => {
      const prisma = prismaMock();
      withAssignment(prisma, { status: 'assigned' } as never);
      const res = await service(prisma).patchAssignment(ATHLETE, 'asg-1', {
        status: 'skipped',
        skipReason: 'injury',
      } as never);
      expect(prisma.sessionAssignment.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'skipped', skipReason: 'injury' } }),
      );
      expect(res.skipReason).toBe('injury');
    });

    it('skip sans motif → 422 SKIP_REASON_REQUIRED', async () => {
      const prisma = prismaMock();
      withAssignment(prisma, { status: 'assigned' } as never);
      await expect(
        service(prisma).patchAssignment(ATHLETE, 'asg-1', { status: 'skipped' } as never),
      ).rejects.toMatchObject({ response: { error: 'SKIP_REASON_REQUIRED' } });
    });

    it('un-skip (skipped → assigned) efface le motif', async () => {
      const prisma = prismaMock();
      withAssignment(prisma, { status: 'skipped', skipReason: 'injury' });
      await service(prisma).patchAssignment(COACH, 'asg-1', { status: 'assigned' } as never);
      expect(prisma.sessionAssignment.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'assigned', skipReason: null } }),
      );
    });

    it('athlète ne peut pas replanifier → 403', async () => {
      const prisma = prismaMock();
      withAssignment(prisma);
      await expect(
        service(prisma).patchAssignment(ATHLETE, 'asg-1', { dueDate: '2026-08-01' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('coach ne peut pas « démarrer » à la place de l’athlète → 403', async () => {
      const prisma = prismaMock();
      withAssignment(prisma, { status: 'assigned' } as never);
      await expect(
        service(prisma).patchAssignment(COACH, 'asg-1', { status: 'in_progress' } as never),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('affectation réalisée : transition refusée → 422 ASSIGNMENT_COMPLETED', async () => {
      const prisma = prismaMock();
      withAssignment(prisma, { status: 'completed' });
      await expect(
        service(prisma).patchAssignment(COACH, 'asg-1', {
          status: 'skipped',
          skipReason: 'other',
        } as never),
      ).rejects.toMatchObject({ response: { error: 'ASSIGNMENT_COMPLETED' } });
    });

    it('transition illégale skipped → in_progress → 422 ASSIGNMENT_STATUS_TRANSITION', async () => {
      const prisma = prismaMock();
      withAssignment(prisma, { status: 'skipped' });
      await expect(
        service(prisma).patchAssignment(ATHLETE, 'asg-1', { status: 'in_progress' } as never),
      ).rejects.toMatchObject({ response: { error: 'ASSIGNMENT_STATUS_TRANSITION' } });
    });

    it('corps vide → 422 ASSIGNMENT_UPDATE_EMPTY', async () => {
      const prisma = prismaMock();
      await expect(service(prisma).patchAssignment(COACH, 'asg-1', {})).rejects.toMatchObject({
        response: { error: 'ASSIGNMENT_UPDATE_EMPTY' },
      });
    });

    it('introuvable → 404', async () => {
      const prisma = prismaMock();
      prisma.sessionAssignment.findFirst.mockResolvedValue(null);
      await expect(
        service(prisma).patchAssignment(COACH, 'asg-1', {
          status: 'skipped',
          skipReason: 'other',
        } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('utilisateur non lié → 403', async () => {
      const prisma = prismaMock();
      prisma.sessionAssignment.findFirst.mockResolvedValue({
        ...assignmentRow({ athleteId: 'a-9' }),
        session: sessionRow({ coachId: 'c-9' }),
      });
      await expect(
        service(prisma).patchAssignment(ATHLETE, 'asg-1', { status: 'in_progress' } as never),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('removeAssignment (ADR-31 — désassignation)', () => {
    it('coach propriétaire : soft-delete (deletedAt)', async () => {
      const prisma = prismaMock();
      prisma.sessionAssignment.findFirst.mockResolvedValue({
        ...assignmentRow({ status: 'assigned' } as never),
        session: { coachId: 'c-1' },
      });
      prisma.sessionAssignment.update = jest.fn().mockResolvedValue({});
      await service(prisma).removeAssignment(COACH, 'asg-1');
      expect(prisma.sessionAssignment.update).toHaveBeenCalledWith({
        where: { id: 'asg-1' },
        data: { deletedAt: expect.any(Date) },
      });
    });

    it('athlète → 403', async () => {
      const prisma = prismaMock();
      prisma.sessionAssignment.findFirst.mockResolvedValue({
        ...assignmentRow(),
        session: { coachId: 'c-1' },
      });
      await expect(service(prisma).removeAssignment(ATHLETE, 'asg-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('affectation réalisée → 422 ASSIGNMENT_COMPLETED', async () => {
      const prisma = prismaMock();
      prisma.sessionAssignment.findFirst.mockResolvedValue({
        ...assignmentRow({ status: 'completed' }),
        session: { coachId: 'c-1' },
      });
      await expect(service(prisma).removeAssignment(COACH, 'asg-1')).rejects.toMatchObject({
        response: { error: 'ASSIGNMENT_COMPLETED' },
      });
    });

    it('introuvable → 404', async () => {
      const prisma = prismaMock();
      prisma.sessionAssignment.findFirst.mockResolvedValue(null);
      await expect(service(prisma).removeAssignment(COACH, 'asg-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
