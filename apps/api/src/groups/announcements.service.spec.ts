import {
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import type { NotificationQueueService } from '../jobs/notification-queue.service';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { AnnouncementsService } from './announcements.service';

const COACH: AuthenticatedUser = { id: 'c-1', role: 'coach' };
const ATHLETE: AuthenticatedUser = { id: 'a-1', role: 'athlete' };

function announcementRow(over: Record<string, unknown> = {}) {
  return {
    id: 'ann-1',
    groupId: 'g-1',
    authorId: 'c-1',
    body: 'Séance déplacée à 10h.',
    createdAt: new Date('2026-06-21T09:00:00.000Z'),
    deletedAt: null,
    author: { id: 'c-1', firstName: 'Awa', lastName: 'Diallo', sport: null },
    ...over,
  };
}

type PrismaMock = {
  group: { findFirst: jest.Mock };
  groupMember: { findFirst: jest.Mock; findMany: jest.Mock; count: jest.Mock };
  groupAnnouncement: {
    findMany: jest.Mock;
    create: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
  };
  announcementReaction: {
    groupBy: jest.Mock;
    findMany: jest.Mock;
    upsert: jest.Mock;
    deleteMany: jest.Mock;
  };
  announcementRead: {
    groupBy: jest.Mock;
    count: jest.Mock;
    upsert: jest.Mock;
  };
  announcementReply: {
    groupBy: jest.Mock;
  };
};

function prismaMock(): PrismaMock {
  return {
    group: { findFirst: jest.fn() },
    groupMember: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    groupAnnouncement: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue(announcementRow()),
      findFirst: jest.fn(),
      update: jest.fn().mockResolvedValue(announcementRow({ deletedAt: new Date() })),
    },
    announcementReaction: {
      groupBy: jest.fn().mockResolvedValue([]),
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue(undefined),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    announcementRead: {
      groupBy: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      upsert: jest.fn().mockResolvedValue(undefined),
    },
    announcementReply: {
      groupBy: jest.fn().mockResolvedValue([]),
    },
  };
}

function queueMock(): NotificationQueueService {
  return { enqueue: jest.fn().mockResolvedValue(undefined) } as unknown as NotificationQueueService;
}

// TeammatePresenter : par défaut aucun auteur présenté (reactorRows vides) ; on présigne 1:1.
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

// ConfigService : get() → undefined → le service retombe sur le plafond par défaut.
function configMock() {
  return { get: jest.fn().mockReturnValue(undefined) };
}

function service(prisma: PrismaMock, queue = queueMock()): AnnouncementsService {
  return new AnnouncementsService(
    prisma as unknown as PrismaService,
    queue,
    teammatesMock() as never,
    configMock() as never,
  );
}

describe('AnnouncementsService (ADR-46)', () => {
  describe('createAnnouncement', () => {
    it('coach propriétaire : crée + notifie chaque membre actif (sauf l’auteur)', async () => {
      const prisma = prismaMock();
      const queue = queueMock();
      prisma.group.findFirst.mockResolvedValue({ coachId: 'c-1' });
      prisma.groupMember.findMany.mockResolvedValue([{ athleteId: 'a-1' }, { athleteId: 'a-2' }]);

      const res = await service(prisma, queue).createAnnouncement('c-1', 'g-1', {
        body: 'Séance déplacée à 10h.',
      });

      expect(prisma.groupAnnouncement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { groupId: 'g-1', authorId: 'c-1', body: 'Séance déplacée à 10h.' },
        }),
      );
      expect(queue.enqueue).toHaveBeenCalledTimes(2);
      expect(queue.enqueue).toHaveBeenCalledWith(
        { type: 'group_announcement', recipientUserId: 'a-1', resourceId: 'g-1', actorId: 'c-1' },
        'group_announcement--ann-1--a-1',
      );
      // L'auteur (coach) est exclu du fan-out par la requête membres.
      expect(prisma.groupMember.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { groupId: 'g-1', leftAt: null, athleteId: { not: 'c-1' } },
        }),
      );
      expect(res.author.id).toBe('c-1');
      expect(res.body).toBe('Séance déplacée à 10h.');
    });

    it('coach non propriétaire → 403, sans créer', async () => {
      const prisma = prismaMock();
      prisma.group.findFirst.mockResolvedValue({ coachId: 'autre' });
      await expect(
        service(prisma).createAnnouncement('c-1', 'g-1', { body: 'x' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.groupAnnouncement.create).not.toHaveBeenCalled();
    });

    it('groupe introuvable → 404', async () => {
      const prisma = prismaMock();
      prisma.group.findFirst.mockResolvedValue(null);
      await expect(
        service(prisma).createAnnouncement('c-1', 'g-1', { body: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('listAnnouncements', () => {
    it('coach propriétaire : liste (récentes d’abord)', async () => {
      const prisma = prismaMock();
      prisma.group.findFirst.mockResolvedValue({ id: 'g-1' });
      prisma.groupAnnouncement.findMany.mockResolvedValue([announcementRow()]);
      const res = await service(prisma).listAnnouncements(COACH, 'g-1');
      expect(res.data).toHaveLength(1);
      expect(prisma.groupAnnouncement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { groupId: 'g-1', deletedAt: null },
          orderBy: { createdAt: 'desc' },
        }),
      );
    });

    it('athlète membre actif : liste autorisée', async () => {
      const prisma = prismaMock();
      prisma.groupMember.findFirst.mockResolvedValue({ id: 'm-1' });
      prisma.groupAnnouncement.findMany.mockResolvedValue([announcementRow()]);
      const res = await service(prisma).listAnnouncements(ATHLETE, 'g-1');
      expect(res.data).toHaveLength(1);
    });

    it('agrège les réactions (compteurs ordonnés + myReactions de l’appelant)', async () => {
      const prisma = prismaMock();
      prisma.group.findFirst.mockResolvedValue({ id: 'g-1' });
      prisma.groupAnnouncement.findMany.mockResolvedValue([announcementRow()]);
      // Désordonné en entrée → l'ordre de sortie suit le jeu canonique (❤️ avant 🔥).
      prisma.announcementReaction.groupBy.mockResolvedValue([
        { announcementId: 'ann-1', emoji: '🔥', _count: { id: 5 } },
        { announcementId: 'ann-1', emoji: '❤️', _count: { id: 8 } },
      ]);
      // 1er findMany = emoji de l'appelant ; 2e findMany (auteurs) = défaut [] du mock.
      prisma.announcementReaction.findMany.mockResolvedValueOnce([
        { announcementId: 'ann-1', emoji: '❤️' },
      ]);

      prisma.announcementRead.groupBy.mockResolvedValue([
        { announcementId: 'ann-1', _count: { userId: 9 } },
      ]);
      prisma.announcementReply.groupBy.mockResolvedValue([
        { announcementId: 'ann-1', _count: { id: 3 } },
      ]);
      prisma.groupMember.count.mockResolvedValue(12);

      const res = await service(prisma).listAnnouncements(COACH, 'g-1');

      expect(res.data[0].reactions).toEqual([
        { emoji: '❤️', count: 8, reactors: [] },
        { emoji: '🔥', count: 5, reactors: [] },
      ]);
      expect(res.data[0].myReactions).toEqual(['❤️']);
      // Accusé de lecture agrégé : « 9/12 ont lu » — deux entiers, jamais la liste.
      expect(res.data[0].readCount).toBe(9);
      expect(res.data[0].memberCount).toBe(12);
      // Compteur de réponses agrégé (ADR-48/50) — entier seul, jamais le contenu.
      expect(res.data[0].replyCount).toBe(3);
    });

    it('athlète non-membre → 404', async () => {
      const prisma = prismaMock();
      prisma.groupMember.findFirst.mockResolvedValue(null);
      await expect(service(prisma).listAnnouncements(ATHLETE, 'g-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('réactions nominatives (ADR-49 D1) : auteurs minimisés, filtrés membres actifs', async () => {
      const prisma = prismaMock();
      prisma.group.findFirst.mockResolvedValue({ id: 'g-1' });
      prisma.groupAnnouncement.findMany.mockResolvedValue([announcementRow()]);
      prisma.announcementReaction.groupBy.mockResolvedValue([
        { announcementId: 'ann-1', emoji: '❤️', _count: { id: 2 } },
      ]);
      // 1er findMany = emoji de l'appelant (aucun) ; 2e findMany = auteurs (avec user).
      prisma.announcementReaction.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
        {
          announcementId: 'ann-1',
          emoji: '❤️',
          user: { id: 'a-2', firstName: 'Léa', lastName: 'Bernard', photoUrl: null },
        },
        {
          announcementId: 'ann-1',
          emoji: '❤️',
          user: { id: 'a-3', firstName: 'Karim', lastName: 'Sow', photoUrl: null },
        },
      ]);

      const res = await service(prisma).listAnnouncements(COACH, 'g-1');

      expect(res.data[0].reactions[0]).toEqual({
        emoji: '❤️',
        count: 2,
        reactors: [
          { id: 'a-2', firstName: 'Léa', lastName: 'Bernard' },
          { id: 'a-3', firstName: 'Karim', lastName: 'Sow' },
        ],
      });
      // La requête des auteurs borne aux membres ACTIFS du groupe (exclut partis/anonymisés).
      const reactorCall = prisma.announcementReaction.findMany.mock.calls[1][0];
      expect(reactorCall.where.user).toEqual({
        deletedAt: null,
        groupMemberships: { some: { groupId: 'g-1', leftAt: null } },
      });
    });
  });

  describe('deleteAnnouncement', () => {
    it('coach propriétaire : soft-delete', async () => {
      const prisma = prismaMock();
      prisma.group.findFirst.mockResolvedValue({ coachId: 'c-1' });
      prisma.groupAnnouncement.findFirst.mockResolvedValue({ id: 'ann-1' });
      await service(prisma).deleteAnnouncement('c-1', 'g-1', 'ann-1');
      expect(prisma.groupAnnouncement.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'ann-1' }, data: { deletedAt: expect.any(Date) } }),
      );
    });

    it('annonce introuvable → 404', async () => {
      const prisma = prismaMock();
      prisma.group.findFirst.mockResolvedValue({ coachId: 'c-1' });
      prisma.groupAnnouncement.findFirst.mockResolvedValue(null);
      await expect(
        service(prisma).deleteAnnouncement('c-1', 'g-1', 'ann-x'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('addReaction (ADR-48, Palier 1)', () => {
    it('athlète membre : upsert idempotent + renvoie les compteurs agrégés', async () => {
      const prisma = prismaMock();
      prisma.groupMember.findFirst.mockResolvedValue({ id: 'm-1' });
      prisma.groupAnnouncement.findFirst.mockResolvedValue({ id: 'ann-1' });
      prisma.announcementReaction.groupBy.mockResolvedValue([
        { announcementId: 'ann-1', emoji: '❤️', _count: { id: 1 } },
      ]);
      // 1er findMany = emoji de l'appelant ; 2e findMany (auteurs) = défaut [] du mock.
      prisma.announcementReaction.findMany.mockResolvedValueOnce([
        { announcementId: 'ann-1', emoji: '❤️' },
      ]);

      const res = await service(prisma).addReaction(ATHLETE, 'g-1', 'ann-1', '❤️');

      expect(prisma.announcementReaction.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            announcementId_userId_emoji: { announcementId: 'ann-1', userId: 'a-1', emoji: '❤️' },
          },
          create: { announcementId: 'ann-1', userId: 'a-1', emoji: '❤️' },
          update: {},
        }),
      );
      expect(res.reactions).toEqual([{ emoji: '❤️', count: 1, reactors: [] }]);
      expect(res.myReactions).toEqual(['❤️']);
    });

    it('coach propriétaire : autorisé', async () => {
      const prisma = prismaMock();
      prisma.group.findFirst.mockResolvedValue({ id: 'g-1' });
      prisma.groupAnnouncement.findFirst.mockResolvedValue({ id: 'ann-1' });
      await service(prisma).addReaction(COACH, 'g-1', 'ann-1', '🔥');
      expect(prisma.announcementReaction.upsert).toHaveBeenCalled();
    });

    it('emoji hors jeu borné → 422, sans écrire', async () => {
      const prisma = prismaMock();
      await expect(
        service(prisma).addReaction(ATHLETE, 'g-1', 'ann-1', '🤡'),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(prisma.announcementReaction.upsert).not.toHaveBeenCalled();
      // Validation d'entrée avant toute lecture de ressource (pas d'énumération).
      expect(prisma.groupMember.findFirst).not.toHaveBeenCalled();
    });

    it('athlète non-membre → 404, sans écrire', async () => {
      const prisma = prismaMock();
      prisma.groupMember.findFirst.mockResolvedValue(null);
      await expect(
        service(prisma).addReaction(ATHLETE, 'g-1', 'ann-1', '❤️'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.announcementReaction.upsert).not.toHaveBeenCalled();
    });

    it('annonce absente du groupe → 404, sans écrire', async () => {
      const prisma = prismaMock();
      prisma.groupMember.findFirst.mockResolvedValue({ id: 'm-1' });
      prisma.groupAnnouncement.findFirst.mockResolvedValue(null);
      await expect(
        service(prisma).addReaction(ATHLETE, 'g-1', 'ann-x', '❤️'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.announcementReaction.upsert).not.toHaveBeenCalled();
    });
  });

  describe('removeReaction (ADR-48, Palier 1)', () => {
    it('athlète membre : deleteMany idempotent + renvoie l’état à jour', async () => {
      const prisma = prismaMock();
      prisma.groupMember.findFirst.mockResolvedValue({ id: 'm-1' });
      prisma.groupAnnouncement.findFirst.mockResolvedValue({ id: 'ann-1' });

      const res = await service(prisma).removeReaction(ATHLETE, 'g-1', 'ann-1', '❤️');

      expect(prisma.announcementReaction.deleteMany).toHaveBeenCalledWith({
        where: { announcementId: 'ann-1', userId: 'a-1', emoji: '❤️' },
      });
      // Plus aucune réaction (mocks vides par défaut) → listes vides.
      expect(res.reactions).toEqual([]);
      expect(res.myReactions).toEqual([]);
    });

    it('emoji hors jeu borné → 422', async () => {
      const prisma = prismaMock();
      await expect(
        service(prisma).removeReaction(ATHLETE, 'g-1', 'ann-1', 'x'),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(prisma.announcementReaction.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('markRead (ADR-48, Palier 1)', () => {
    it('athlète membre : upsert idempotent + renvoie l’agrégat readCount/memberCount', async () => {
      const prisma = prismaMock();
      prisma.groupMember.findFirst.mockResolvedValue({ id: 'm-1' });
      prisma.groupAnnouncement.findFirst.mockResolvedValue({ id: 'ann-1' });
      prisma.announcementRead.count.mockResolvedValue(9);
      prisma.groupMember.count.mockResolvedValue(12);

      const res = await service(prisma).markRead(ATHLETE, 'g-1', 'ann-1');

      expect(prisma.announcementRead.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { announcementId_userId: { announcementId: 'ann-1', userId: 'a-1' } },
          create: { announcementId: 'ann-1', userId: 'a-1' },
          update: {},
        }),
      );
      expect(res).toEqual({ readCount: 9, memberCount: 12 });
    });

    it('coach (pas un lecteur comptabilisé) → 404, sans écrire', async () => {
      const prisma = prismaMock();
      // Le coach n'a pas de ligne groupMember → assertActiveMember échoue.
      prisma.groupMember.findFirst.mockResolvedValue(null);
      await expect(service(prisma).markRead(COACH, 'g-1', 'ann-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.announcementRead.upsert).not.toHaveBeenCalled();
    });

    it('annonce absente du groupe → 404, sans écrire', async () => {
      const prisma = prismaMock();
      prisma.groupMember.findFirst.mockResolvedValue({ id: 'm-1' });
      prisma.groupAnnouncement.findFirst.mockResolvedValue(null);
      await expect(service(prisma).markRead(ATHLETE, 'g-1', 'ann-x')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.announcementRead.upsert).not.toHaveBeenCalled();
    });
  });
});
