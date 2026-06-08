import type { PrismaService } from '../prisma/prisma.service';
import type { ObjectStorageService } from '../storage/object-storage.service';
import { ExportCleanupService } from './export-cleanup.service';

function setup(expired: Array<{ id: string; objectKey: string | null }>) {
  const findMany = jest.fn().mockResolvedValue(expired);
  const update = jest.fn().mockResolvedValue({});
  const prisma = { exportJob: { findMany, update } } as unknown as PrismaService;
  const deleteObject = jest.fn().mockResolvedValue(undefined);
  const storage = { deleteObject } as unknown as ObjectStorageService;
  return {
    service: new ExportCleanupService(prisma, storage),
    findMany,
    update,
    deleteObject,
  };
}

describe('ExportCleanupService', () => {
  it('supprime l’objet puis passe le job à expired', async () => {
    const { service, update, deleteObject } = setup([
      { id: 'job-1', objectKey: 'exports/u/job-1.json' },
    ]);

    await service.cleanupExpired();

    expect(deleteObject).toHaveBeenCalledWith('exports/u/job-1.json');
    expect(update).toHaveBeenCalledWith({ where: { id: 'job-1' }, data: { status: 'expired' } });
  });

  it('ne fait rien quand aucune archive n’est expirée', async () => {
    const { service, update, deleteObject } = setup([]);

    await service.cleanupExpired();

    expect(deleteObject).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('poursuit le lot si une purge échoue (le job reste ready)', async () => {
    const { service, update, deleteObject } = setup([
      { id: 'job-1', objectKey: 'k1' },
      { id: 'job-2', objectKey: 'k2' },
    ]);
    deleteObject.mockRejectedValueOnce(new Error('S3 down'));

    await service.cleanupExpired();

    // job-1 échoue (pas d'update), job-2 réussit (update expired).
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({ where: { id: 'job-2' }, data: { status: 'expired' } });
  });
});
