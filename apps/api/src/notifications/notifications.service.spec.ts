import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

type PrismaMock = {
  deviceToken: Record<string, jest.Mock>;
  notificationPreferences: Record<string, jest.Mock>;
};

function prismaMock(): PrismaMock {
  return {
    deviceToken: { upsert: jest.fn(), updateMany: jest.fn() },
    notificationPreferences: { findUnique: jest.fn(), upsert: jest.fn() },
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

describe('NotificationsService (TLX-110, ADR-22)', () => {
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
