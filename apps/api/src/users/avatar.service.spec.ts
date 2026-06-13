import {
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { type User } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { ObjectStorageService } from '../storage/object-storage.service';
import { AvatarService } from './avatar.service';

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

type Mocks = {
  findUnique: jest.Mock;
  update: jest.Mock;
  getPresignedUploadUrl: jest.Mock;
  getPresignedDownloadUrl: jest.Mock;
  headObject: jest.Mock;
  deleteObject: jest.Mock;
};

function setup(over: Partial<Mocks> = {}) {
  const m: Mocks = {
    findUnique: over.findUnique ?? jest.fn().mockResolvedValue(userRow()),
    update: over.update ?? jest.fn().mockImplementation(({ data }) => userRow(data)),
    getPresignedUploadUrl:
      over.getPresignedUploadUrl ?? jest.fn().mockResolvedValue('https://upload.example/put'),
    getPresignedDownloadUrl:
      over.getPresignedDownloadUrl ??
      jest.fn().mockImplementation(async (key: string) => `https://signed.example/${key}`),
    headObject:
      over.headObject ??
      jest.fn().mockResolvedValue({ contentLength: 1024, contentType: 'image/png' }),
    deleteObject: over.deleteObject ?? jest.fn().mockResolvedValue(undefined),
  };
  const prisma = {
    user: { findUnique: m.findUnique, update: m.update },
  } as unknown as PrismaService;
  const storage = {
    getPresignedUploadUrl: m.getPresignedUploadUrl,
    getPresignedDownloadUrl: m.getPresignedDownloadUrl,
    headObject: m.headObject,
    deleteObject: m.deleteObject,
  } as unknown as ObjectStorageService;
  const config = { get: jest.fn(() => undefined) } as unknown as ConfigService;
  return { service: new AvatarService(prisma, storage, config), ...m };
}

describe('AvatarService (TLX-124)', () => {
  describe('createUpload', () => {
    it('renvoie une URL présignée (PUT) + clé objet dans le namespace du titulaire', async () => {
      const { service, getPresignedUploadUrl } = setup();
      const res = await service.createUpload('u-1', 'image/png');

      expect(res.uploadUrl).toBe('https://upload.example/put');
      expect(res.objectKey).toMatch(/^avatars\/u-1\//);
      expect(res.expiresAt).toEqual(expect.any(String));
      // La clé et le contentType sont liés à l'URL présignée.
      expect(getPresignedUploadUrl).toHaveBeenCalledWith(
        res.objectKey,
        'image/png',
        expect.any(Number),
      );
    });

    it('422 INVALID_CONTENT_TYPE pour un format non géré', async () => {
      const { service, getPresignedUploadUrl } = setup();
      await expect(service.createUpload('u-1', 'image/gif')).rejects.toMatchObject({
        constructor: UnprocessableEntityException,
        response: { error: 'INVALID_CONTENT_TYPE' },
      });
      expect(getPresignedUploadUrl).not.toHaveBeenCalled();
    });
  });

  describe('confirm', () => {
    it('adopte l’objet téléversé, présigne le photoUrl renvoyé', async () => {
      const { service, update, getPresignedDownloadUrl } = setup();
      const res = await service.confirm('u-1', 'avatars/u-1/abc');

      expect(update).toHaveBeenCalledWith({
        where: { id: 'u-1' },
        data: { photoUrl: 'avatars/u-1/abc' },
      });
      expect(getPresignedDownloadUrl).toHaveBeenCalledWith('avatars/u-1/abc', expect.any(Number));
      expect(res.photoUrl).toBe('https://signed.example/avatars/u-1/abc');
    });

    it('supprime l’ancien avatar lors d’un remplacement', async () => {
      const { service, deleteObject } = setup({
        findUnique: jest.fn().mockResolvedValue(userRow({ photoUrl: 'avatars/u-1/old' })),
      });
      await service.confirm('u-1', 'avatars/u-1/new');
      expect(deleteObject).toHaveBeenCalledWith('avatars/u-1/old');
    });

    it('403 si la clé n’est pas dans le namespace du titulaire', async () => {
      const { service, update } = setup();
      await expect(service.confirm('u-1', 'avatars/u-2/abc')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(update).not.toHaveBeenCalled();
    });

    it('422 AVATAR_NOT_UPLOADED si l’objet n’existe pas', async () => {
      const { service, update } = setup({ headObject: jest.fn().mockResolvedValue(null) });
      await expect(service.confirm('u-1', 'avatars/u-1/abc')).rejects.toMatchObject({
        response: { error: 'AVATAR_NOT_UPLOADED' },
      });
      expect(update).not.toHaveBeenCalled();
    });

    it('422 AVATAR_TOO_LARGE + supprime l’objet si trop volumineux', async () => {
      const { service, update, deleteObject } = setup({
        headObject: jest
          .fn()
          .mockResolvedValue({ contentLength: 99_000_000, contentType: 'image/png' }),
      });
      await expect(service.confirm('u-1', 'avatars/u-1/abc')).rejects.toMatchObject({
        response: { error: 'AVATAR_TOO_LARGE' },
      });
      expect(deleteObject).toHaveBeenCalledWith('avatars/u-1/abc');
      expect(update).not.toHaveBeenCalled();
    });

    it('422 INVALID_CONTENT_TYPE si l’objet déposé a un type non géré', async () => {
      const { service, deleteObject } = setup({
        headObject: jest
          .fn()
          .mockResolvedValue({ contentLength: 1024, contentType: 'application/pdf' }),
      });
      await expect(service.confirm('u-1', 'avatars/u-1/abc')).rejects.toMatchObject({
        response: { error: 'INVALID_CONTENT_TYPE' },
      });
      expect(deleteObject).toHaveBeenCalledWith('avatars/u-1/abc');
    });

    it('404 si le compte est introuvable', async () => {
      const { service } = setup({ findUnique: jest.fn().mockResolvedValue(null) });
      await expect(service.confirm('u-1', 'avatars/u-1/abc')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('supprime l’objet + efface photo_url', async () => {
      const { service, update, deleteObject } = setup({
        findUnique: jest.fn().mockResolvedValue(userRow({ photoUrl: 'avatars/u-1/abc' })),
      });
      await service.remove('u-1');
      expect(deleteObject).toHaveBeenCalledWith('avatars/u-1/abc');
      expect(update).toHaveBeenCalledWith({ where: { id: 'u-1' }, data: { photoUrl: null } });
    });

    it('no-op si aucun avatar', async () => {
      const { service, update, deleteObject } = setup();
      await service.remove('u-1');
      expect(deleteObject).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    });
  });
});
