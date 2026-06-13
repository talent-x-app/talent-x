import { NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { type User } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { ObjectStorageService } from '../storage/object-storage.service';
import { ProfileService } from './profile.service';

// Stockage présigné mocké : renvoie une URL stable à partir de la clé objet.
const storageMock = {
  getPresignedDownloadUrl: jest.fn(async (key: string) => `https://signed.example/${key}`),
} as unknown as ObjectStorageService;
const configMock = { get: jest.fn(() => 3600) } as unknown as ConfigService;

/** Construit le service avec les dépendances de présignature mockées. */
function makeService(prisma: PrismaService): ProfileService {
  return new ProfileService(prisma, storageMock, configMock);
}

function userRow(over: Partial<User> = {}): User {
  return {
    id: 'u-1',
    email: 'a@ex.com',
    passwordHash: 'x',
    role: 'athlete',
    firstName: 'Ada',
    lastName: 'Lovelace',
    sport: '400m',
    bio: null,
    photoUrl: null,
    birthDate: null,
    twoFactorEnabled: false,
    twoFactorSecret: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    deletedAt: null,
    ...over,
  } as User;
}

function prismaMock(over: { findUnique?: jest.Mock; update?: jest.Mock } = {}): PrismaService {
  return {
    user: {
      findUnique: over.findUnique ?? jest.fn(),
      update: over.update ?? jest.fn(),
    },
  } as unknown as PrismaService;
}

describe('ProfileService', () => {
  describe('getMe', () => {
    it('projette la ligne users vers le DTO User (champs nuls → undefined)', async () => {
      const prisma = prismaMock({ findUnique: jest.fn().mockResolvedValue(userRow()) });
      const service = makeService(prisma);

      await expect(service.getMe('u-1')).resolves.toEqual({
        id: 'u-1',
        email: 'a@ex.com',
        role: 'athlete',
        firstName: 'Ada',
        lastName: 'Lovelace',
        photoUrl: undefined,
        sport: '400m',
        bio: undefined,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      });
    });

    it('présigne photoUrl quand un avatar (clé objet) est stocké (TLX-124)', async () => {
      const prisma = prismaMock({
        findUnique: jest.fn().mockResolvedValue(userRow({ photoUrl: 'avatars/u-1/abc' })),
      });
      const result = await makeService(prisma).getMe('u-1');
      expect(result.photoUrl).toBe('https://signed.example/avatars/u-1/abc');
    });

    it('404 quand l’utilisateur est introuvable', async () => {
      const prisma = prismaMock({ findUnique: jest.fn().mockResolvedValue(null) });
      await expect(makeService(prisma).getMe('u-x')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('404 quand le compte est soft-deleted', async () => {
      const prisma = prismaMock({
        findUnique: jest.fn().mockResolvedValue(userRow({ deletedAt: new Date() })),
      });
      await expect(makeService(prisma).getMe('u-1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateMe', () => {
    it('n’écrit que les champs fournis (PATCH) et renvoie le profil mis à jour', async () => {
      const update = jest.fn().mockResolvedValue(userRow({ bio: 'Sprinteuse', sport: '200m' }));
      const prisma = prismaMock({
        findUnique: jest.fn().mockResolvedValue(userRow()),
        update,
      });
      const service = makeService(prisma);

      const result = await service.updateMe('u-1', { bio: 'Sprinteuse', sport: '200m' });

      expect(update).toHaveBeenCalledWith({
        where: { id: 'u-1' },
        data: { bio: 'Sprinteuse', sport: '200m' },
      });
      expect(result.bio).toBe('Sprinteuse');
      expect(result.sport).toBe('200m');
    });

    it('corps vide → update sans champ (no-op), renvoie le profil courant', async () => {
      const update = jest.fn().mockResolvedValue(userRow());
      const prisma = prismaMock({
        findUnique: jest.fn().mockResolvedValue(userRow()),
        update,
      });

      await makeService(prisma).updateMe('u-1', {});

      expect(update).toHaveBeenCalledWith({ where: { id: 'u-1' }, data: {} });
    });

    it('404 sur compte supprimé, sans tenter l’update', async () => {
      const update = jest.fn();
      const prisma = prismaMock({
        findUnique: jest.fn().mockResolvedValue(userRow({ deletedAt: new Date() })),
        update,
      });

      await expect(makeService(prisma).updateMe('u-1', { bio: 'x' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(update).not.toHaveBeenCalled();
    });
  });
});
