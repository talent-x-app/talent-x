import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import type { NotificationQueueService } from '../jobs/notification-queue.service';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { KudosService } from './kudos.service';

const GIVER: AuthenticatedUser = { id: 'a-1', role: 'athlete' };

type PrismaMock = {
  sessionAssignment: { findFirst: jest.Mock; findMany: jest.Mock };
  groupMember: { findFirst: jest.Mock };
  participationKudos: { upsert: jest.Mock; deleteMany: jest.Mock; findMany: jest.Mock };
};

function prismaMock(): PrismaMock {
  return {
    sessionAssignment: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    groupMember: { findFirst: jest.fn() },
    participationKudos: {
      upsert: jest.fn().mockResolvedValue(undefined),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
}

function queueMock(): NotificationQueueService {
  return { enqueue: jest.fn().mockResolvedValue(undefined) } as unknown as NotificationQueueService;
}

function teammatesMock() {
  return {
    present: jest.fn(
      async (a: { id: string; firstName: string | null; lastName: string | null }) => ({
        id: a.id,
        firstName: a.firstName ?? undefined,
        lastName: a.lastName ?? undefined,
      }),
    ),
    presentMany: jest.fn(
      async (list: Array<{ id: string; firstName: string | null; lastName: string | null }>) =>
        list.map((a) => ({
          id: a.id,
          firstName: a.firstName ?? undefined,
          lastName: a.lastName ?? undefined,
        })),
    ),
  };
}

function configMock() {
  return { get: jest.fn().mockReturnValue(undefined) };
}

function service(prisma: PrismaMock, queue = queueMock()): KudosService {
  return new KudosService(
    prisma as unknown as PrismaService,
    queue,
    teammatesMock() as never,
    configMock() as never,
  );
}

/** Cible valide : affectation d'un coéquipier, séance de groupe, présence confirmée. */
function targetGoing(over: Record<string, unknown> = {}) {
  return {
    athleteId: 'a-2',
    sessionId: 's-1',
    attendance: 'going',
    groupAssignment: { groupId: 'g-1', deletedAt: null },
    ...over,
  };
}

describe('KudosService (ADR-48/49, Palier 2)', () => {
  describe('give', () => {
    it('membre + cible going : upsert idempotent + notifie group_kudos (resourceId = affectation)', async () => {
      const prisma = prismaMock();
      const queue = queueMock();
      prisma.sessionAssignment.findFirst.mockResolvedValue(targetGoing());
      prisma.groupMember.findFirst.mockResolvedValue({ id: 'm-1' });

      await service(prisma, queue).give(GIVER, 'asg-2');

      expect(prisma.participationKudos.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { assignmentId_giverId: { assignmentId: 'asg-2', giverId: 'a-1' } },
          create: { assignmentId: 'asg-2', giverId: 'a-1' },
          update: {},
        }),
      );
      expect(queue.enqueue).toHaveBeenCalledWith(
        { type: 'group_kudos', recipientUserId: 'a-2', resourceId: 'asg-2', actorId: 'a-1' },
        'group_kudos--asg-2--a-1',
      );
    });

    /**
     * TLX-266 — la valeur émise décide de l'écran ouvert. Elle valait `sessionId`, et le tap
     * de l'athlète tombait sur « Impossible de charger cette séance » (mesuré sur appareil,
     * QA-04.6) : la route athlète `session/[id]` consomme une **affectation**, son nom ment.
     *
     * La fixture sépare exprès les deux identifiants (`asg-2` ≠ `s-1`) : c'est la seule façon
     * pour un test de voir la différence. Le test mobile symétrique passait justement parce
     * qu'il se donnait `'asg-3'` — une valeur choisie pour lui plaire, jamais rencontrée.
     */
    it('le resourceId émis est l’affectation, pas la séance — la distinction est mesurable', async () => {
      const prisma = prismaMock();
      const queue = queueMock();
      prisma.sessionAssignment.findFirst.mockResolvedValue(targetGoing());
      prisma.groupMember.findFirst.mockResolvedValue({ id: 'm-1' });

      await service(prisma, queue).give(GIVER, 'asg-2');

      const [payload] = (queue.enqueue as jest.Mock).mock.calls[0] as [{ resourceId: string }];
      expect(payload.resourceId).toBe('asg-2');
      expect(payload.resourceId).not.toBe('s-1');
    });

    it('séance individuelle (sans provenance de groupe) → 404, sans écrire', async () => {
      const prisma = prismaMock();
      prisma.sessionAssignment.findFirst.mockResolvedValue(targetGoing({ groupAssignment: null }));
      await expect(service(prisma).give(GIVER, 'asg-2')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.participationKudos.upsert).not.toHaveBeenCalled();
    });

    it('appelant non membre du groupe → 404, sans écrire', async () => {
      const prisma = prismaMock();
      prisma.sessionAssignment.findFirst.mockResolvedValue(targetGoing());
      prisma.groupMember.findFirst.mockResolvedValue(null);
      await expect(service(prisma).give(GIVER, 'asg-2')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.participationKudos.upsert).not.toHaveBeenCalled();
    });

    it('auto-kudos → 422, sans écrire', async () => {
      const prisma = prismaMock();
      prisma.sessionAssignment.findFirst.mockResolvedValue(targetGoing({ athleteId: 'a-1' }));
      prisma.groupMember.findFirst.mockResolvedValue({ id: 'm-1' });
      await expect(service(prisma).give(GIVER, 'asg-2')).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      expect(prisma.participationKudos.upsert).not.toHaveBeenCalled();
    });

    it('présence non confirmée (maybe) → 422, sans écrire (frontière participation)', async () => {
      const prisma = prismaMock();
      prisma.sessionAssignment.findFirst.mockResolvedValue(targetGoing({ attendance: 'maybe' }));
      prisma.groupMember.findFirst.mockResolvedValue({ id: 'm-1' });
      await expect(service(prisma).give(GIVER, 'asg-2')).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      expect(prisma.participationKudos.upsert).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('idempotent : deleteMany du kudos de l’appelant', async () => {
      const prisma = prismaMock();
      prisma.sessionAssignment.findFirst.mockResolvedValue(targetGoing());
      prisma.groupMember.findFirst.mockResolvedValue({ id: 'm-1' });
      await service(prisma).remove(GIVER, 'asg-2');
      expect(prisma.participationKudos.deleteMany).toHaveBeenCalledWith({
        where: { assignmentId: 'asg-2', giverId: 'a-1' },
      });
    });
  });

  describe('listTeammatesAttendance', () => {
    it('affectation individuelle (sans groupe) → liste vide', async () => {
      const prisma = prismaMock();
      prisma.sessionAssignment.findFirst.mockResolvedValue({
        sessionId: 's-1',
        groupAssignment: null,
      });
      const res = await service(prisma).listTeammatesAttendance(GIVER, 'asg-1');
      expect(res.data).toEqual([]);
      expect(prisma.sessionAssignment.findMany).not.toHaveBeenCalled();
    });

    it('coéquipiers going : identité minimisée + kudos agrégés (mine reflété)', async () => {
      const prisma = prismaMock();
      prisma.sessionAssignment.findFirst.mockResolvedValue({
        sessionId: 's-1',
        groupAssignment: { groupId: 'g-1' },
      });
      prisma.sessionAssignment.findMany.mockResolvedValue([
        {
          id: 'asg-2',
          athlete: { id: 'a-2', firstName: 'Léa', lastName: 'Bernard', photoUrl: null },
          kudos: [
            {
              giverId: 'a-1',
              giver: { id: 'a-1', firstName: 'At', lastName: 'Moi', photoUrl: null },
            },
          ],
        },
      ]);

      const res = await service(prisma).listTeammatesAttendance(GIVER, 'asg-1');

      expect(res.data).toHaveLength(1);
      expect(res.data[0].assignmentId).toBe('asg-2');
      expect(res.data[0].teammate).toEqual({ id: 'a-2', firstName: 'Léa', lastName: 'Bernard' });
      expect(res.data[0].kudos.count).toBe(1);
      expect(res.data[0].kudos.mine).toBe(true);
      // La requête borne aux présences confirmées de co-membres actifs du même groupe.
      const where = prisma.sessionAssignment.findMany.mock.calls[0][0].where;
      expect(where.attendance).toBe('going');
      expect(where.athleteId).toEqual({ not: 'a-1' });
      expect(where.groupAssignment).toEqual({ groupId: 'g-1', deletedAt: null });
      expect(where.athlete).toEqual({
        deletedAt: null,
        groupMemberships: { some: { groupId: 'g-1', leftAt: null } },
      });
    });
  });
});
