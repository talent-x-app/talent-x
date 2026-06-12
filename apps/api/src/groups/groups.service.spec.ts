import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { OwnershipService } from '../common/authorization/ownership.service';
import type { PrismaService } from '../prisma/prisma.service';
import { PaginationQueryDto } from '../common/pagination/pagination-query.dto';
import type { NotificationQueueService } from '../jobs/notification-queue.service';
import { GroupsService } from './groups.service';

function groupRow(over: Record<string, unknown> = {}) {
  return {
    id: 'g-1',
    coachId: 'c-1',
    name: 'Sprint',
    description: null,
    inviteCode: 'ABCD2345',
    inviteCodeRevokedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    deletedAt: null,
    _count: { members: 0 },
    ...over,
  };
}

/** Ownership factice : autorise par défaut (les refus sont testés via mockRejected). */
function ownershipMock(over: Partial<OwnershipService> = {}): OwnershipService {
  return {
    assertGroupOwnedByCoach: jest.fn().mockResolvedValue(undefined),
    ...over,
  } as unknown as OwnershipService;
}

type PrismaMock = {
  group: Record<string, jest.Mock>;
  groupMember: Record<string, jest.Mock>;
  coachAthleteLink: Record<string, jest.Mock>;
  groupAssignment: Record<string, jest.Mock>;
  sessionAssignment: Record<string, jest.Mock>;
  $transaction: jest.Mock;
};

function prismaMock(): PrismaMock {
  const mock: PrismaMock = {
    group: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    groupMember: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    coachAthleteLink: { findFirst: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
    // Réconciliation ADR-30 : aucune affectation de groupe par défaut (no-op).
    groupAssignment: { findMany: jest.fn().mockResolvedValue([]) },
    sessionAssignment: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    // Tableau → Promise.all ; callback → exécuté avec le mock lui-même comme tx.
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
): GroupsService {
  return new GroupsService(prisma as unknown as PrismaService, ownership, queue);
}

describe('GroupsService', () => {
  describe('createGroup', () => {
    it('crée un groupe avec un code généré et memberCount 0', async () => {
      const prisma = prismaMock();
      prisma.group.create.mockResolvedValue(groupRow());
      const result = await service(prisma).createGroup('c-1', { name: 'Sprint' });

      expect(prisma.group.create).toHaveBeenCalledTimes(1);
      const arg = prisma.group.create.mock.calls[0][0];
      expect(arg.data.inviteCode).toMatch(/^[A-Z2-9]{8}$/);
      expect(result).toMatchObject({
        id: 'g-1',
        coachId: 'c-1',
        memberCount: 0,
        inviteCode: 'ABCD2345',
      });
    });

    it('réessaie sur collision de code unique (P2002) puis réussit', async () => {
      const prisma = prismaMock();
      const p2002 = new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: '5',
      });
      prisma.group.create.mockRejectedValueOnce(p2002).mockResolvedValueOnce(groupRow());

      await service(prisma).createGroup('c-1', { name: 'Sprint' });
      expect(prisma.group.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('listGroups', () => {
    it('mappe les lignes + memberCount et calcule hasNext', async () => {
      const prisma = prismaMock();
      prisma.group.findMany.mockResolvedValue([groupRow({ _count: { members: 3 } })]);
      prisma.group.count.mockResolvedValue(25);
      const q = Object.assign(new PaginationQueryDto(), { page: 1, limit: 20 });

      const page = await service(prisma).listGroups('c-1', q);

      expect(page.data[0].memberCount).toBe(3);
      expect(page.meta).toEqual({ total: 25, page: 1, limit: 20, hasNext: true });
    });
  });

  describe('listMyGroups', () => {
    it('mappe les groupes actifs vers la vue athlète (coach + joinedAt, sans inviteCode)', async () => {
      const prisma = prismaMock();
      prisma.groupMember.findMany.mockResolvedValue([
        {
          joinedAt: new Date('2026-02-01T00:00:00.000Z'),
          group: {
            ...groupRow({ _count: { members: 4 } }),
            coach: { id: 'c-1', firstName: 'Coach', lastName: 'One', sport: null },
          },
        },
      ]);

      const res = await service(prisma).listMyGroups('a-1');

      // Filtre : appartenances actives dont le groupe n'est pas supprimé.
      expect(prisma.groupMember.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { athleteId: 'a-1', leftAt: null, group: { deletedAt: null } },
        }),
      );
      expect(res.data).toHaveLength(1);
      expect(res.data[0]).toEqual({
        id: 'g-1',
        name: 'Sprint',
        description: undefined,
        memberCount: 4,
        joinedAt: '2026-02-01T00:00:00.000Z',
        coach: { id: 'c-1', firstName: 'Coach', lastName: 'One', sport: undefined },
      });
      // Le code d'invitation n'est jamais exposé à l'athlète (ADR-16).
      expect(res.data[0]).not.toHaveProperty('inviteCode');
    });

    it('athlète sans groupe → liste vide', async () => {
      const prisma = prismaMock();
      prisma.groupMember.findMany.mockResolvedValue([]);

      const res = await service(prisma).listMyGroups('a-1');
      expect(res.data).toEqual([]);
    });
  });

  describe('getGroup', () => {
    it('vérifie l’ownership puis renvoie le groupe', async () => {
      const prisma = prismaMock();
      const ownership = ownershipMock();
      prisma.group.findUniqueOrThrow.mockResolvedValue(groupRow({ _count: { members: 2 } }));

      const dto = await service(prisma, ownership).getGroup('c-1', 'g-1');

      expect(ownership.assertGroupOwnedByCoach).toHaveBeenCalledWith('c-1', 'g-1');
      expect(dto.memberCount).toBe(2);
    });

    it('propage le 403/404 de l’ownership', async () => {
      const prisma = prismaMock();
      const ownership = ownershipMock({
        assertGroupOwnedByCoach: jest.fn().mockRejectedValue(new NotFoundException()),
      });
      await expect(service(prisma, ownership).getGroup('c-1', 'g-x')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('updateGroup', () => {
    it('n’écrit que les champs fournis (PATCH)', async () => {
      const prisma = prismaMock();
      prisma.group.update.mockResolvedValue(
        groupRow({ name: 'Demi-fond', _count: { members: 0 } }),
      );

      await service(prisma).updateGroup('c-1', 'g-1', { name: 'Demi-fond' });

      expect(prisma.group.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'g-1' }, data: { name: 'Demi-fond' } }),
      );
    });
  });

  describe('manageInviteCode', () => {
    it('revoke → horodate la révocation et renvoie inviteCode:null', async () => {
      const prisma = prismaMock();
      prisma.group.update.mockResolvedValue(groupRow());

      const res = await service(prisma).manageInviteCode('c-1', 'g-1', 'revoke');

      expect(prisma.group.update.mock.calls[0][0].data.inviteCodeRevokedAt).toBeInstanceOf(Date);
      expect(res).toEqual({ inviteCode: null });
    });

    it('regenerate → nouveau code + reset de la révocation', async () => {
      const prisma = prismaMock();
      prisma.group.update.mockResolvedValue(groupRow());

      const res = await service(prisma).manageInviteCode('c-1', 'g-1', 'regenerate');

      const data = prisma.group.update.mock.calls[0][0].data;
      expect(data.inviteCode).toMatch(/^[A-Z2-9]{8}$/);
      expect(data.inviteCodeRevokedAt).toBeNull();
      expect(res.inviteCode).toMatch(/^[A-Z2-9]{8}$/);
    });
  });

  describe('toGroupDto (masquage du code)', () => {
    it('inviteCode → null quand le code est révoqué', async () => {
      const prisma = prismaMock();
      prisma.group.findUniqueOrThrow.mockResolvedValue(
        groupRow({ inviteCodeRevokedAt: new Date(), _count: { members: 0 } }),
      );

      const dto = await service(prisma).getGroup('c-1', 'g-1');
      expect(dto.inviteCode).toBeNull();
    });
  });

  describe('joinGroup', () => {
    it('404 si le code est invalide ou révoqué', async () => {
      const prisma = prismaMock();
      prisma.group.findFirst.mockResolvedValue(null);

      await expect(service(prisma).joinGroup('a-1', 'NOPE')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('idempotent : déjà membre actif → renvoie l’appartenance sans recréer ni notifier', async () => {
      const prisma = prismaMock();
      const queue = queueMock();
      prisma.group.findFirst.mockResolvedValue({ id: 'g-1', coachId: 'c-1' });
      prisma.groupMember.findFirst.mockResolvedValue({
        athleteId: 'a-1',
        groupId: 'g-1',
        joinedAt: new Date('2026-01-01T00:00:00.000Z'),
        athlete: { id: 'a-1', firstName: 'Ada', lastName: 'L', sport: '200m' },
      });
      prisma.coachAthleteLink.findFirst.mockResolvedValue({ id: 'l-1' });

      const member = await service(prisma, ownershipMock(), queue).joinGroup('a-1', 'ABCD2345');

      expect(prisma.groupMember.create).not.toHaveBeenCalled();
      expect(prisma.coachAthleteLink.create).not.toHaveBeenCalled();
      expect(queue.enqueue).not.toHaveBeenCalled();
      expect(member).toMatchObject({ athleteId: 'a-1', groupId: 'g-1' });
    });

    it('nouvelle adhésion → notifie le coach propriétaire (group_update, ADR-22)', async () => {
      const prisma = prismaMock();
      const queue = queueMock();
      prisma.group.findFirst.mockResolvedValue({ id: 'g-1', coachId: 'c-1' });
      prisma.groupMember.findFirst.mockResolvedValue(null);
      prisma.groupMember.create.mockResolvedValue({
        id: 'gm-1',
        athleteId: 'a-2',
        groupId: 'g-1',
        joinedAt: new Date('2026-01-02T00:00:00.000Z'),
        athlete: { id: 'a-2', firstName: 'Bo', lastName: 'M', sport: null },
      });
      prisma.coachAthleteLink.findFirst.mockResolvedValue(null);

      await service(prisma, ownershipMock(), queue).joinGroup('a-2', 'ABCD2345');

      expect(queue.enqueue).toHaveBeenCalledWith(
        { type: 'group_update', recipientUserId: 'c-1', resourceId: 'g-1' },
        'group_update--gm-1',
      );
    });

    it('nouveau membre → crée l’appartenance ET le lien coach↔athlète', async () => {
      const prisma = prismaMock();
      prisma.group.findFirst.mockResolvedValue({ id: 'g-1', coachId: 'c-1' });
      prisma.groupMember.findFirst.mockResolvedValue(null);
      prisma.groupMember.create.mockResolvedValue({
        athleteId: 'a-2',
        groupId: 'g-1',
        joinedAt: new Date('2026-01-02T00:00:00.000Z'),
        athlete: { id: 'a-2', firstName: 'Bo', lastName: 'M', sport: null },
      });
      prisma.coachAthleteLink.findFirst.mockResolvedValue(null);

      await service(prisma).joinGroup('a-2', 'ABCD2345');

      expect(prisma.groupMember.create).toHaveBeenCalledTimes(1);
      expect(prisma.coachAthleteLink.create).toHaveBeenCalledWith({
        data: { coachId: 'c-1', athleteId: 'a-2', source: 'group', groupId: 'g-1' },
      });
    });

    it('lien existant → ne crée pas de doublon', async () => {
      const prisma = prismaMock();
      prisma.group.findFirst.mockResolvedValue({ id: 'g-2', coachId: 'c-1' });
      prisma.groupMember.findFirst.mockResolvedValue(null);
      prisma.groupMember.create.mockResolvedValue({
        athleteId: 'a-2',
        groupId: 'g-2',
        joinedAt: new Date(),
        athlete: null,
      });
      prisma.coachAthleteLink.findFirst.mockResolvedValue({ id: 'l-existing' });

      await service(prisma).joinGroup('a-2', 'WXYZ2345');
      expect(prisma.coachAthleteLink.create).not.toHaveBeenCalled();
    });

    it('réconciliation (ADR-30) : matérialise les affectations de groupe à venir et notifie l’athlète', async () => {
      const prisma = prismaMock();
      const queue = queueMock();
      prisma.group.findFirst.mockResolvedValue({ id: 'g-1', coachId: 'c-1' });
      prisma.groupMember.findFirst.mockResolvedValue(null);
      prisma.groupMember.create.mockResolvedValue({
        id: 'gm-1',
        athleteId: 'a-2',
        groupId: 'g-1',
        joinedAt: new Date(),
        athlete: null,
      });
      prisma.coachAthleteLink.findFirst.mockResolvedValue(null);
      prisma.groupAssignment.findMany.mockResolvedValue([
        { id: 'ga-1', sessionId: 's-1', dueDate: null },
      ]);
      prisma.sessionAssignment.findFirst.mockResolvedValue(null);
      prisma.sessionAssignment.create.mockResolvedValue({ id: 'asg-new' });

      await service(prisma, ownershipMock(), queue).joinGroup('a-2', 'ABCD2345');

      expect(prisma.sessionAssignment.create).toHaveBeenCalledWith({
        data: { sessionId: 's-1', athleteId: 'a-2', dueDate: undefined, groupAssignmentId: 'ga-1' },
        select: { id: true },
      });
      expect(queue.enqueue).toHaveBeenCalledWith(
        { type: 'session_assigned', recipientUserId: 'a-2', resourceId: 'asg-new' },
        'session_assigned--asg-new',
      );
    });
  });

  describe('removeGroupMember', () => {
    it('404 si l’athlète n’est pas membre actif', async () => {
      const prisma = prismaMock();
      prisma.groupMember.updateMany.mockResolvedValue({ count: 0 });

      await expect(service(prisma).removeGroupMember('c-1', 'g-1', 'a-9')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('retire le membre et termine le lien s’il ne reste aucun groupe actif', async () => {
      const prisma = prismaMock();
      prisma.groupMember.updateMany.mockResolvedValue({ count: 1 });
      prisma.groupMember.count.mockResolvedValue(0); // plus aucun groupe actif chez ce coach

      await service(prisma).removeGroupMember('c-1', 'g-1', 'a-1');

      expect(prisma.coachAthleteLink.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { coachId: 'c-1', athleteId: 'a-1', source: 'group', endedAt: null },
        }),
      );
    });

    it('conserve le lien si l’athlète reste dans un autre groupe du coach', async () => {
      const prisma = prismaMock();
      prisma.groupMember.updateMany.mockResolvedValue({ count: 1 });
      prisma.groupMember.count.mockResolvedValue(1);

      await service(prisma).removeGroupMember('c-1', 'g-1', 'a-1');
      expect(prisma.coachAthleteLink.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('leaveGroup', () => {
    it('404 si non membre actif', async () => {
      const prisma = prismaMock();
      prisma.group.findFirst.mockResolvedValue({ coachId: 'c-1' });
      prisma.groupMember.updateMany.mockResolvedValue({ count: 0 });

      await expect(service(prisma).leaveGroup('a-1', 'g-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('réconciliation (ADR-30) : soft-delete les affectations de groupe à venir non commencées', async () => {
      const prisma = prismaMock();
      prisma.group.findFirst.mockResolvedValue({ coachId: 'c-1' });
      prisma.groupMember.updateMany.mockResolvedValue({ count: 1 });
      prisma.groupAssignment.findMany.mockResolvedValue([{ id: 'ga-1' }, { id: 'ga-2' }]);
      prisma.groupMember.count.mockResolvedValue(0); // endLinkIfLastGroup

      await service(prisma).leaveGroup('a-1', 'g-1');

      const args = prisma.sessionAssignment.updateMany.mock.calls[0][0];
      expect(args.where).toMatchObject({
        athleteId: 'a-1',
        groupAssignmentId: { in: ['ga-1', 'ga-2'] },
        status: 'assigned',
      });
      expect(args.data).toEqual({ deletedAt: expect.any(Date) });
    });
  });
});
