import { NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../prisma/prisma.service';
import type { ExportQueueService } from '../jobs/export-queue.service';
import type { ObjectStorageService } from '../storage/object-storage.service';
import { ExportService } from './export.service';

function setup(overrides: {
  findFirst?: jest.Mock;
  create?: jest.Mock;
  auditCreate?: jest.Mock;
  enqueue?: jest.Mock;
  presign?: jest.Mock;
}) {
  const findFirst = overrides.findFirst ?? jest.fn().mockResolvedValue(null);
  const create = overrides.create ?? jest.fn();
  const auditCreate = overrides.auditCreate ?? jest.fn().mockResolvedValue({});
  const prisma = {
    exportJob: { findFirst, create },
    auditLog: { create: auditCreate },
  } as unknown as PrismaService;
  const enqueue = overrides.enqueue ?? jest.fn().mockResolvedValue(undefined);
  const queue = { enqueueExport: enqueue } as unknown as ExportQueueService;
  const presign = overrides.presign ?? jest.fn().mockResolvedValue('https://signed/url');
  const storage = { getPresignedDownloadUrl: presign } as unknown as ObjectStorageService;
  const config = { get: () => 86400 } as unknown as ConfigService;
  return {
    service: new ExportService(prisma, queue, storage, config),
    findFirst,
    create,
    auditCreate,
    enqueue,
    presign,
  };
}

describe('ExportService', () => {
  describe('requestExport', () => {
    it('crée le job, l’enfile et journalise quand aucun export actif', async () => {
      const create = jest.fn().mockResolvedValue({ id: 'job-1', status: 'pending' });
      const { service, enqueue, auditCreate } = setup({ create });

      const result = await service.requestExport('user-9');

      expect(result).toEqual({ jobId: 'job-1', status: 'pending' });
      expect(enqueue).toHaveBeenCalledWith('job-1', 'user-9');
      expect(auditCreate).toHaveBeenCalledWith({
        data: {
          actorId: 'user-9',
          action: 'data.export',
          entityType: 'export_job',
          entityId: 'job-1',
        },
      });
    });

    it('renvoie l’export actif existant sans recréer ni réenfiler (idempotent)', async () => {
      const findFirst = jest.fn().mockResolvedValue({ id: 'job-x', status: 'processing' });
      const create = jest.fn();
      const { service, enqueue } = setup({ findFirst, create });

      const result = await service.requestExport('user-9');

      expect(result).toEqual({ jobId: 'job-x', status: 'processing' });
      expect(create).not.toHaveBeenCalled();
      expect(enqueue).not.toHaveBeenCalled();
    });
  });

  describe('getExport', () => {
    it('404 quand le job n’est pas celui du demandeur', async () => {
      const { service } = setup({ findFirst: jest.fn().mockResolvedValue(null) });
      await expect(service.getExport('user-9', 'job-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('ready non expiré → URL présignée + expiresAt', async () => {
      const expiresAt = new Date(Date.now() + 3600_000);
      const findFirst = jest.fn().mockResolvedValue({
        id: 'job-1',
        status: 'ready',
        objectKey: 'exports/u/job-1.json',
        expiresAt,
      });
      const presign = jest.fn().mockResolvedValue('https://signed/url');
      const { service } = setup({ findFirst, presign });

      const result = await service.getExport('user-9', 'job-1');

      expect(result.status).toBe('ready');
      expect(result.downloadUrl).toBe('https://signed/url');
      expect(result.expiresAt).toBe(expiresAt.toISOString());
      // TTL borné par l'expiration (≤ ~3600 s).
      expect(presign.mock.calls[0][1]).toBeLessThanOrEqual(3600);
    });

    it('pending → pas d’URL', async () => {
      const findFirst = jest.fn().mockResolvedValue({ id: 'job-1', status: 'pending' });
      const { service, presign } = setup({ findFirst });

      const result = await service.getExport('user-9', 'job-1');

      expect(result).toEqual({ jobId: 'job-1', status: 'pending' });
      expect(presign).not.toHaveBeenCalled();
    });

    it('ready mais archive expirée → failed, pas d’URL', async () => {
      const findFirst = jest.fn().mockResolvedValue({
        id: 'job-1',
        status: 'ready',
        objectKey: 'exports/u/job-1.json',
        expiresAt: new Date(Date.now() - 1000),
      });
      const { service, presign } = setup({ findFirst });

      const result = await service.getExport('user-9', 'job-1');

      expect(result).toEqual({ jobId: 'job-1', status: 'failed' });
      expect(presign).not.toHaveBeenCalled();
    });
  });
});
