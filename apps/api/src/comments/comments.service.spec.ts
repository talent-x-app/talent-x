import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { OwnershipService } from '../common/authorization/ownership.service';
import type { ConsentGate } from '../common/authorization/consent.gate';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import type { NotificationQueueService } from '../jobs/notification-queue.service';
import { CommentsService } from './comments.service';

const COACH: AuthenticatedUser = { id: 'c-1', role: 'coach' };
const ATHLETE: AuthenticatedUser = { id: 'a-1', role: 'athlete' };
const PERF_ID = '11111111-1111-4111-8111-111111111111';
const SESSION_ID = '22222222-2222-4222-8222-222222222222';

function commentRow(over: Record<string, unknown> = {}) {
  return {
    id: 'cm-1',
    authorId: 'c-1',
    sessionId: null,
    performanceId: PERF_ID,
    body: 'Beau travail, garde le dos gainé.',
    createdAt: new Date('2026-06-09T10:00:00.000Z'),
    deletedAt: null,
    ...over,
  };
}

function ownershipMock(over: Partial<OwnershipService> = {}): OwnershipService {
  return {
    assertCoachLinkedToAthlete: jest.fn().mockResolvedValue(undefined),
    ...over,
  } as unknown as OwnershipService;
}

function consentMock(over: Partial<ConsentGate> = {}): ConsentGate {
  return {
    assertActiveConsent: jest.fn().mockResolvedValue(undefined),
    ...over,
  } as unknown as ConsentGate;
}

type PrismaMock = {
  comment: Record<string, jest.Mock>;
  performance: Record<string, jest.Mock>;
  session: Record<string, jest.Mock>;
  sessionAssignment: Record<string, jest.Mock>;
  $transaction: jest.Mock;
};

function prismaMock(): PrismaMock {
  const mock: PrismaMock = {
    comment: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    performance: { findUnique: jest.fn() },
    session: { findFirst: jest.fn() },
    sessionAssignment: { findFirst: jest.fn() },
    $transaction: jest.fn((arg: unknown) =>
      Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(mock),
    ),
  };
  return mock;
}

function queueMock(): NotificationQueueService {
  return { enqueue: jest.fn().mockResolvedValue(undefined) } as unknown as NotificationQueueService;
}

function make(
  prisma: PrismaMock,
  ownership = ownershipMock(),
  consent = consentMock(),
  queue = queueMock(),
) {
  return new CommentsService(prisma as unknown as PrismaService, ownership, consent, queue);
}

/** Performance dont la séance appartient au coach c-1, athlète a-1. */
function perfAccessible(over: Record<string, unknown> = {}) {
  return {
    athleteId: 'a-1',
    assignmentId: 'asg-7',
    assignment: { session: { coachId: 'c-1' } },
    ...over,
  };
}

describe('CommentsService (TLX-086)', () => {
  describe('createComment — performance', () => {
    it('le coach lié et consenti commente une performance (sort de « à revoir »)', async () => {
      const prisma = prismaMock();
      prisma.performance.findUnique.mockResolvedValue(perfAccessible());
      prisma.comment.create.mockResolvedValue(commentRow());
      const consent = consentMock();
      const ownership = ownershipMock();

      const result = await make(prisma, ownership, consent).createComment(COACH, {
        performanceId: PERF_ID,
        body: 'Beau travail, garde le dos gainé.',
      });

      expect(ownership.assertCoachLinkedToAthlete).toHaveBeenCalledWith('c-1', 'a-1');
      expect(consent.assertActiveConsent).toHaveBeenCalledWith('a-1', 'coach_access');
      expect(prisma.comment.create).toHaveBeenCalledWith({
        data: {
          authorId: 'c-1',
          sessionId: null,
          performanceId: PERF_ID,
          body: expect.any(String),
        },
      });
      expect(result.performanceId).toBe(PERF_ID);
      expect(result.authorId).toBe('c-1');
    });

    it('commentaire coach sur une perf → notifie l’athlète (performance_feedback, ADR-22)', async () => {
      const prisma = prismaMock();
      const queue = queueMock();
      prisma.performance.findUnique.mockResolvedValue(perfAccessible());
      prisma.comment.create.mockResolvedValue(commentRow());

      await make(prisma, ownershipMock(), consentMock(), queue).createComment(COACH, {
        performanceId: PERF_ID,
        body: 'Beau travail.',
      });

      // resourceId = affectation (la ressource navigable côté athlète, ADR-23).
      expect(queue.enqueue).toHaveBeenCalledWith(
        { type: 'performance_feedback', recipientUserId: 'a-1', resourceId: 'asg-7' },
        'performance_feedback--cm-1',
      );
    });

    it('commentaire de l’athlète sur sa propre perf → aucune notification', async () => {
      const prisma = prismaMock();
      const queue = queueMock();
      prisma.performance.findUnique.mockResolvedValue(perfAccessible());
      prisma.comment.create.mockResolvedValue(commentRow({ authorId: 'a-1' }));

      await make(prisma, ownershipMock(), consentMock(), queue).createComment(ATHLETE, {
        performanceId: PERF_ID,
        body: 'Je note pour la prochaine.',
      });

      expect(queue.enqueue).not.toHaveBeenCalled();
    });

    it('rejette si ni cible ni les deux cibles (400)', async () => {
      const prisma = prismaMock();
      await expect(make(prisma).createComment(COACH, { body: 'x' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(
        make(prisma).createComment(COACH, {
          sessionId: SESSION_ID,
          performanceId: PERF_ID,
          body: 'x',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.comment.create).not.toHaveBeenCalled();
    });

    it('403 CONSENT_REQUIRED si le coach n’a pas coach_access', async () => {
      const prisma = prismaMock();
      prisma.performance.findUnique.mockResolvedValue(perfAccessible());
      const consent = consentMock({
        assertActiveConsent: jest
          .fn()
          .mockRejectedValue(new ForbiddenException({ error: 'CONSENT_REQUIRED' })),
      });
      await expect(
        make(prisma, ownershipMock(), consent).createComment(COACH, {
          performanceId: PERF_ID,
          body: 'x',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.comment.create).not.toHaveBeenCalled();
    });

    it('403 si le coach ne possède pas la séance de la performance', async () => {
      const prisma = prismaMock();
      prisma.performance.findUnique.mockResolvedValue(
        perfAccessible({ assignment: { session: { coachId: 'autre-coach' } } }),
      );
      await expect(
        make(prisma).createComment(COACH, { performanceId: PERF_ID, body: 'x' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('l’athlète titulaire peut commenter sa propre performance', async () => {
      const prisma = prismaMock();
      prisma.performance.findUnique.mockResolvedValue(perfAccessible());
      prisma.comment.create.mockResolvedValue(commentRow({ authorId: 'a-1' }));
      const result = await make(prisma).createComment(ATHLETE, {
        performanceId: PERF_ID,
        body: 'RAS',
      });
      expect(result.authorId).toBe('a-1');
    });

    it('404 si la performance n’existe pas', async () => {
      const prisma = prismaMock();
      prisma.performance.findUnique.mockResolvedValue(null);
      await expect(
        make(prisma).createComment(COACH, { performanceId: PERF_ID, body: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('createComment — séance', () => {
    it('le coach propriétaire commente sa séance', async () => {
      const prisma = prismaMock();
      prisma.session.findFirst.mockResolvedValue({ coachId: 'c-1' });
      prisma.comment.create.mockResolvedValue(
        commentRow({ sessionId: SESSION_ID, performanceId: null }),
      );
      const result = await make(prisma).createComment(COACH, {
        sessionId: SESSION_ID,
        body: 'Bien',
      });
      expect(result.sessionId).toBe(SESSION_ID);
    });

    it('403 si un autre coach commente une séance qui n’est pas la sienne', async () => {
      const prisma = prismaMock();
      prisma.session.findFirst.mockResolvedValue({ coachId: 'autre-coach' });
      await expect(
        make(prisma).createComment(COACH, { sessionId: SESSION_ID, body: 'x' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('l’athlète affecté à la séance peut la commenter, pas un non-affecté', async () => {
      const prisma = prismaMock();
      prisma.session.findFirst.mockResolvedValue({ coachId: 'c-1' });
      prisma.sessionAssignment.findFirst.mockResolvedValueOnce({ id: 'asg-1' });
      prisma.comment.create.mockResolvedValue(
        commentRow({ sessionId: SESSION_ID, performanceId: null, authorId: 'a-1' }),
      );
      await expect(
        make(prisma).createComment(ATHLETE, { sessionId: SESSION_ID, body: 'Contexte' }),
      ).resolves.toMatchObject({ sessionId: SESSION_ID });

      prisma.sessionAssignment.findFirst.mockResolvedValueOnce(null);
      await expect(
        make(prisma).createComment(ATHLETE, { sessionId: SESSION_ID, body: 'x' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('listComments', () => {
    it('liste paginée des commentaires d’une performance', async () => {
      const prisma = prismaMock();
      prisma.performance.findUnique.mockResolvedValue(perfAccessible());
      prisma.comment.findMany.mockResolvedValue([commentRow()]);
      prisma.comment.count.mockResolvedValue(1);
      const page = await make(prisma).listComments(COACH, {
        performanceId: PERF_ID,
        page: 1,
        limit: 20,
        skip: 0,
      } as never);
      expect(page.data).toHaveLength(1);
      expect(page.meta).toMatchObject({ total: 1, page: 1, limit: 20, hasNext: false });
      expect(prisma.comment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { deletedAt: null, performanceId: PERF_ID } }),
      );
    });

    it('400 si aucune cible fournie', async () => {
      const prisma = prismaMock();
      await expect(
        make(prisma).listComments(COACH, { page: 1, limit: 20, skip: 0 } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('deleteComment', () => {
    it('l’auteur supprime son commentaire (soft-delete)', async () => {
      const prisma = prismaMock();
      prisma.comment.findFirst.mockResolvedValue(commentRow());
      prisma.comment.update.mockResolvedValue(commentRow({ deletedAt: new Date() }));
      await make(prisma).deleteComment(COACH, 'cm-1');
      expect(prisma.comment.update).toHaveBeenCalledWith({
        where: { id: 'cm-1' },
        data: { deletedAt: expect.any(Date) },
      });
    });

    it('403 si un autre utilisateur tente de supprimer', async () => {
      const prisma = prismaMock();
      prisma.comment.findFirst.mockResolvedValue(commentRow({ authorId: 'someone-else' }));
      await expect(make(prisma).deleteComment(COACH, 'cm-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.comment.update).not.toHaveBeenCalled();
    });

    it('404 si le commentaire est introuvable', async () => {
      const prisma = prismaMock();
      prisma.comment.findFirst.mockResolvedValue(null);
      await expect(make(prisma).deleteComment(COACH, 'cm-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
