import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { PaginationQueryDto } from '../common/pagination/pagination-query.dto';
import { NotificationsService } from './notifications.service';

type PrismaMock = {
  deviceToken: Record<string, jest.Mock>;
  notificationPreferences: Record<string, jest.Mock>;
  notification: Record<string, jest.Mock>;
  $transaction: jest.Mock;
};

function prismaMock(): PrismaMock {
  return {
    deviceToken: { upsert: jest.fn(), updateMany: jest.fn() },
    notificationPreferences: { findUnique: jest.fn(), upsert: jest.fn() },
    notification: { findMany: jest.fn(), count: jest.fn(), updateMany: jest.fn() },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
}

function make(prisma: PrismaMock): NotificationsService {
  return new NotificationsService(prisma as unknown as PrismaService);
}

function deviceRow(over: Record<string, unknown> = {}) {
  return {
    id: 'd-1',
    userId: 'u-1',
    token: 'tok-abc',
    platform: 'fcm',
    createdAt: new Date('2026-06-10T08:00:00.000Z'),
    lastSeenAt: new Date('2026-06-10T08:00:00.000Z'),
    revokedAt: null,
    ...over,
  };
}

describe('NotificationsService (TLX-110/111, ADR-22/23)', () => {
  describe('listNotifications (feed in-app)', () => {
    it('page triée récentes d’abord + unreadCount', async () => {
      const prisma = prismaMock();
      prisma.notification.findMany.mockResolvedValue([
        {
          id: 'n-2',
          userId: 'u-1',
          type: 'performance_feedback',
          resourceId: 'perf-1',
          dedupeKey: 'k2',
          readAt: null,
          createdAt: new Date('2026-06-10T10:00:00.000Z'),
        },
        {
          id: 'n-1',
          userId: 'u-1',
          type: 'session_assigned',
          resourceId: 'asg-1',
          dedupeKey: 'k1',
          readAt: new Date('2026-06-09T10:00:00.000Z'),
          createdAt: new Date('2026-06-09T09:00:00.000Z'),
        },
      ]);
      prisma.notification.count.mockResolvedValueOnce(2).mockResolvedValueOnce(1);

      const q = Object.assign(new PaginationQueryDto(), { page: 1, limit: 20 });
      const res = await make(prisma).listNotifications('u-1', q);

      expect(prisma.notification.findMany).toHaveBeenCalledWith({
        where: { userId: 'u-1' },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
      });
      expect(res.data[0]).toEqual({
        id: 'n-2',
        type: 'performance_feedback',
        resourceId: 'perf-1',
        readAt: undefined,
        createdAt: '2026-06-10T10:00:00.000Z',
      });
      expect(res.data[1].readAt).toBe('2026-06-09T10:00:00.000Z');
      expect(res.meta).toMatchObject({ total: 2, page: 1, limit: 20, hasNext: false });
      expect(res.unreadCount).toBe(1);
    });
  });

  describe('readAll', () => {
    it('passe à lues toutes les non-lues du compte et renvoie le compte', async () => {
      const prisma = prismaMock();
      prisma.notification.updateMany.mockResolvedValue({ count: 3 });

      const res = await make(prisma).readAll('u-1');

      const arg = prisma.notification.updateMany.mock.calls[0][0];
      expect(arg.where).toEqual({ userId: 'u-1', readAt: null });
      expect(arg.data.readAt).toBeInstanceOf(Date);
      expect(res).toEqual({ updated: 3 });
    });
  });

  describe('registerDevice', () => {
    it('upsert par token : ré-association au compte courant + dé-révocation', async () => {
      const prisma = prismaMock();
      prisma.deviceToken.upsert.mockResolvedValue(deviceRow());

      const res = await make(prisma).registerDevice('u-1', { platform: 'fcm', token: 'tok-abc' });

      const arg = prisma.deviceToken.upsert.mock.calls[0][0];
      expect(arg.where).toEqual({ token: 'tok-abc' });
      expect(arg.create).toMatchObject({ userId: 'u-1', platform: 'fcm' });
      expect(arg.update).toMatchObject({ userId: 'u-1', platform: 'fcm', revokedAt: null });
      expect(res).toMatchObject({ id: 'd-1', platform: 'fcm', token: 'tok-abc' });
    });
  });

  describe('revokeDevice', () => {
    it('révoque (logique) un device actif du propriétaire', async () => {
      const prisma = prismaMock();
      prisma.deviceToken.updateMany.mockResolvedValue({ count: 1 });

      await make(prisma).revokeDevice('u-1', 'd-1');

      const arg = prisma.deviceToken.updateMany.mock.calls[0][0];
      expect(arg.where).toEqual({ id: 'd-1', userId: 'u-1', revokedAt: null });
      expect(arg.data.revokedAt).toBeInstanceOf(Date);
    });

    it('404 si introuvable, étranger ou déjà révoqué', async () => {
      const prisma = prismaMock();
      prisma.deviceToken.updateMany.mockResolvedValue({ count: 0 });
      await expect(make(prisma).revokeDevice('u-1', 'd-x')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('preferences', () => {
    it('GET sans ligne → défauts (tout actif sauf marketing) sans écrire', async () => {
      const prisma = prismaMock();
      prisma.notificationPreferences.findUnique.mockResolvedValue(null);

      const res = await make(prisma).getPreferences('u-1');

      expect(res).toEqual({
        sessionAssigned: true,
        performanceFeedback: true,
        groupUpdates: true,
        marketing: false,
      });
      expect(prisma.notificationPreferences.upsert).not.toHaveBeenCalled();
    });

    it('GET avec ligne → valeurs stockées', async () => {
      const prisma = prismaMock();
      prisma.notificationPreferences.findUnique.mockResolvedValue({
        userId: 'u-1',
        sessionAssigned: false,
        performanceFeedback: true,
        groupUpdates: false,
        marketing: true,
        updatedAt: new Date(),
      });
      const res = await make(prisma).getPreferences('u-1');
      expect(res).toEqual({
        sessionAssigned: false,
        performanceFeedback: true,
        groupUpdates: false,
        marketing: true,
      });
    });

    it('PUT partiel : seuls les champs fournis sont écrits (upsert)', async () => {
      const prisma = prismaMock();
      prisma.notificationPreferences.upsert.mockResolvedValue({
        userId: 'u-1',
        sessionAssigned: false,
        performanceFeedback: true,
        groupUpdates: true,
        marketing: false,
        updatedAt: new Date(),
      });

      const res = await make(prisma).updatePreferences('u-1', { sessionAssigned: false });

      const arg = prisma.notificationPreferences.upsert.mock.calls[0][0];
      expect(arg.where).toEqual({ userId: 'u-1' });
      expect(arg.update).toEqual({ sessionAssigned: false });
      expect(arg.create).toEqual({ userId: 'u-1', sessionAssigned: false });
      expect(res.sessionAssigned).toBe(false);
      expect(res.marketing).toBe(false);
    });
  });
});
