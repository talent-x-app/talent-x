import {
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import type { NotificationQueueService } from '../jobs/notification-queue.service';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { AnnouncementRepliesService } from './announcement-replies.service';

const COACH: AuthenticatedUser = { id: 'c-1', role: 'coach' };
const ATHLETE: AuthenticatedUser = { id: 'a-1', role: 'athlete' };

function replyRow(over: Record<string, unknown> = {}) {
  return {
    id: 'r-1',
    announcementId: 'ann-1',
    authorId: 'a-1',
    body: 'Je serai là samedi !',
    createdAt: new Date('2026-06-23T10:00:00.000Z'),
    author: { id: 'a-1', firstName: 'Léa', lastName: 'Martin', photoUrl: null, deletedAt: null },
    reports: [] as { reporterId: string }[],
    ...over,
  };
}

type PrismaMock = {
  group: { findFirst: jest.Mock };
  groupMember: { findFirst: jest.Mock };
  groupAnnouncement: { findFirst: jest.Mock };
  announcementReply: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
    findFirstOrThrow: jest.Mock;
    count: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  announcementReplyReport: { upsert: jest.Mock };
};

function prismaMock(): PrismaMock {
  return {
    group: { findFirst: jest.fn().mockResolvedValue({ id: 'g-1' }) },
    groupMember: { findFirst: jest.fn().mockResolvedValue({ id: 'm-1' }) },
    groupAnnouncement: { findFirst: jest.fn().mockResolvedValue({ authorId: 'c-1' }) },
    announcementReply: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      findFirstOrThrow: jest.fn().mockResolvedValue(replyRow()),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue(replyRow()),
      update: jest.fn().mockResolvedValue(undefined),
    },
    announcementReplyReport: { upsert: jest.fn().mockResolvedValue(undefined) },
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

// ConfigService : get() → undefined → seuils par défaut (masquage 3, plafond 30).
function configMock() {
  return { get: jest.fn().mockReturnValue(undefined) };
}

function service(prisma: PrismaMock, queue = queueMock()): AnnouncementRepliesService {
  return new AnnouncementRepliesService(
    prisma as unknown as PrismaService,
    queue,
    teammatesMock() as never,
    configMock() as never,
  );
}

describe('AnnouncementRepliesService (ADR-50)', () => {
  describe('listReplies', () => {
    it('athlète membre : masque le corps d’une réponse au-delà du seuil de signalements', async () => {
      const prisma = prismaMock();
      prisma.announcementReply.findMany.mockResolvedValue([
        replyRow({
          id: 'r-2',
          authorId: 'a-2',
          author: { id: 'a-2', firstName: 'Karim', lastName: 'B', photoUrl: null, deletedAt: null },
          reports: [{ reporterId: 'x' }, { reporterId: 'y' }, { reporterId: 'z' }],
        }),
      ]);
      const res = await service(prisma).listReplies(ATHLETE, 'g-1', 'ann-1');
      expect(res.data[0].hidden).toBe(true);
      expect(res.data[0].body).toBe('Réponse masquée en attendant la modération.');
      // reportCount n'est pas exposé au membre.
      expect(res.data[0].reportCount).toBeUndefined();
    });

    it('coach propriétaire : voit le corps + reportCount même au-delà du seuil', async () => {
      const prisma = prismaMock();
      prisma.announcementReply.findMany.mockResolvedValue([
        replyRow({ reports: [{ reporterId: 'x' }, { reporterId: 'y' }, { reporterId: 'z' }] }),
      ]);
      const res = await service(prisma).listReplies(COACH, 'g-1', 'ann-1');
      expect(res.data[0].hidden).toBe(true);
      expect(res.data[0].body).toBe('Je serai là samedi !');
      expect(res.data[0].reportCount).toBe(3);
      expect(res.data[0].canDelete).toBe(true);
    });

    it('auteur au compte clos → identité anonyme (« Membre »)', async () => {
      const prisma = prismaMock();
      prisma.announcementReply.findMany.mockResolvedValue([
        replyRow({
          author: {
            id: 'a-9',
            firstName: 'X',
            lastName: 'Y',
            photoUrl: null,
            deletedAt: new Date(),
          },
        }),
      ]);
      const res = await service(prisma).listReplies(COACH, 'g-1', 'ann-1');
      expect(res.data[0].author).toEqual({ id: 'a-9' });
    });

    it('athlète non membre → 404', async () => {
      const prisma = prismaMock();
      prisma.groupMember.findFirst.mockResolvedValue(null);
      await expect(service(prisma).listReplies(ATHLETE, 'g-1', 'ann-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('createReply', () => {
    it('membre : crée + notifie l’auteur de l’annonce (group_reply)', async () => {
      const prisma = prismaMock();
      const queue = queueMock();
      const res = await service(prisma, queue).createReply(ATHLETE, 'g-1', 'ann-1', {
        body: 'Je serai là samedi !',
      });
      expect(prisma.announcementReply.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { announcementId: 'ann-1', authorId: 'a-1', body: 'Je serai là samedi !' },
        }),
      );
      expect(queue.enqueue).toHaveBeenCalledWith(
        { type: 'group_reply', recipientUserId: 'c-1', resourceId: 'g-1' },
        'group_reply--r-1--c-1',
      );
      expect(res.mine).toBe(true);
    });

    it('coach répond à sa propre annonce → pas d’auto-notification', async () => {
      const prisma = prismaMock();
      const queue = queueMock();
      prisma.announcementReply.create.mockResolvedValue(replyRow({ authorId: 'c-1' }));
      await service(prisma, queue).createReply(COACH, 'g-1', 'ann-1', {
        body: 'Pensez aux pointes.',
      });
      expect(queue.enqueue).not.toHaveBeenCalled();
    });

    it('plafond anti-spam atteint → 422 sans créer', async () => {
      const prisma = prismaMock();
      prisma.announcementReply.count.mockResolvedValue(30);
      await expect(
        service(prisma).createReply(ATHLETE, 'g-1', 'ann-1', { body: 'spam' }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(prisma.announcementReply.create).not.toHaveBeenCalled();
    });

    it('annonce hors groupe → 404', async () => {
      const prisma = prismaMock();
      prisma.groupAnnouncement.findFirst.mockResolvedValue(null);
      await expect(
        service(prisma).createReply(ATHLETE, 'g-1', 'ann-x', { body: 'coucou' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('deleteReply', () => {
    it('auteur : soft-delete avec deletedById', async () => {
      const prisma = prismaMock();
      prisma.announcementReply.findFirst.mockResolvedValue({ id: 'r-1', authorId: 'a-1' });
      await service(prisma).deleteReply(ATHLETE, 'g-1', 'ann-1', 'r-1');
      expect(prisma.announcementReply.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'r-1' },
          data: expect.objectContaining({ deletedById: 'a-1' }),
        }),
      );
    });

    it('coach propriétaire : supprime la réponse d’un membre (modération)', async () => {
      const prisma = prismaMock();
      prisma.announcementReply.findFirst.mockResolvedValue({ id: 'r-1', authorId: 'a-1' });
      await service(prisma).deleteReply(COACH, 'g-1', 'ann-1', 'r-1');
      expect(prisma.announcementReply.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ deletedById: 'c-1' }) }),
      );
    });

    it('membre non auteur → 403', async () => {
      const prisma = prismaMock();
      prisma.announcementReply.findFirst.mockResolvedValue({ id: 'r-1', authorId: 'a-2' });
      await expect(
        service(prisma).deleteReply(ATHLETE, 'g-1', 'ann-1', 'r-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.announcementReply.update).not.toHaveBeenCalled();
    });

    it('réponse introuvable → 404', async () => {
      const prisma = prismaMock();
      prisma.announcementReply.findFirst.mockResolvedValue(null);
      await expect(
        service(prisma).deleteReply(COACH, 'g-1', 'ann-1', 'r-x'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('reportReply', () => {
    it('membre : signale (idempotent) et récupère reportedByMe', async () => {
      const prisma = prismaMock();
      prisma.announcementReply.findFirst.mockResolvedValue({ id: 'r-1', authorId: 'a-2' });
      prisma.announcementReply.findFirstOrThrow.mockResolvedValue(
        replyRow({ authorId: 'a-2', reports: [{ reporterId: 'a-1' }] }),
      );
      const res = await service(prisma).reportReply(ATHLETE, 'g-1', 'ann-1', 'r-1', 'offensive');
      expect(prisma.announcementReplyReport.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { replyId_reporterId: { replyId: 'r-1', reporterId: 'a-1' } },
          create: { replyId: 'r-1', reporterId: 'a-1', reason: 'offensive' },
        }),
      );
      expect(res.reportedByMe).toBe(true);
    });

    it('signaler sa propre réponse → 422', async () => {
      const prisma = prismaMock();
      prisma.announcementReply.findFirst.mockResolvedValue({ id: 'r-1', authorId: 'a-1' });
      await expect(
        service(prisma).reportReply(ATHLETE, 'g-1', 'ann-1', 'r-1', 'spam'),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(prisma.announcementReplyReport.upsert).not.toHaveBeenCalled();
    });
  });
});
