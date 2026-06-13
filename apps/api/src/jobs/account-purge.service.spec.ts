import type { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { ObjectStorageService } from '../storage/object-storage.service';
import { AccountPurgeService } from './account-purge.service';

function setup(candidates: Array<{ id: string; photoUrl?: string | null }>) {
  const tagged = (op: string) => jest.fn().mockReturnValue({ op });
  const userUpdate = jest.fn().mockReturnValue({ op: 'user.update' });
  const auditScrub = jest.fn().mockReturnValue({ op: 'audit.scrub' });
  const findMany = jest.fn().mockResolvedValue(candidates);
  const transaction = jest.fn().mockResolvedValue([]);
  const prisma = {
    user: { findMany, update: userUpdate },
    performance: { deleteMany: tagged('perf') },
    personalRecord: { deleteMany: tagged('record') },
    groupMember: { deleteMany: tagged('gm') },
    coachAthleteLink: { deleteMany: tagged('cal') },
    deviceToken: { deleteMany: tagged('device') },
    refreshToken: { deleteMany: tagged('refresh') },
    exportJob: { deleteMany: tagged('export') },
    comment: { updateMany: tagged('comment') },
    auditLog: { create: tagged('audit'), updateMany: auditScrub },
    $transaction: transaction,
  } as unknown as PrismaService;
  const config = { get: () => 30 } as unknown as ConfigService;
  const deleteObject = jest.fn().mockResolvedValue(undefined);
  const storage = { deleteObject } as unknown as ObjectStorageService;
  return {
    service: new AccountPurgeService(prisma, config, storage),
    findMany,
    userUpdate,
    auditScrub,
    transaction,
    deleteObject,
  };
}

describe('AccountPurgeService', () => {
  it('ne sélectionne que les comptes expirés et non déjà anonymisés', async () => {
    const { service, findMany, transaction } = setup([]);

    await service.purgeExpired();

    const where = findMany.mock.calls[0][0].where;
    expect(where.deletedAt.lte).toBeInstanceOf(Date);
    expect(where.NOT).toEqual({ email: { endsWith: '@anonymized.invalid' } });
    // Aucun candidat → pas de transaction.
    expect(transaction).not.toHaveBeenCalled();
  });

  it('anonymise la ligne user et purge les sous-données', async () => {
    const { service, userUpdate, transaction } = setup([{ id: 'u1' }]);

    await service.purgeExpired();

    expect(transaction).toHaveBeenCalledTimes(1);
    // Anonymisation : e-mail marqueur + PII vidées + secrets neutralisés.
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: expect.objectContaining({
        email: 'deleted-u1@anonymized.invalid',
        firstName: 'Utilisateur',
        lastName: 'supprimé',
        sport: null,
        bio: null,
        photoUrl: null,
        birthDate: null,
        passwordHash: '',
        twoFactorSecret: null,
        twoFactorEnabled: false,
      }),
    });
  });

  it('neutralise le metadata des traces de correction de perf (ADR-33/RB-06/ADR-15)', async () => {
    const { service, auditScrub, transaction } = setup([{ id: 'u1' }]);

    await service.purgeExpired();

    expect(auditScrub).toHaveBeenCalledWith({
      where: { actorId: 'u1', action: 'performance.correction' },
      data: { metadata: Prisma.DbNull },
    });
    // L'opération de scrub est bien embarquée dans la transaction de purge.
    expect(transaction.mock.calls[0][0]).toContainEqual({ op: 'audit.scrub' });
  });

  it('poursuit le lot si une purge échoue', async () => {
    const { service, transaction } = setup([{ id: 'u1' }, { id: 'u2' }]);
    transaction.mockRejectedValueOnce(new Error('contrainte'));

    await expect(service.purgeExpired()).resolves.toBeUndefined();
    expect(transaction).toHaveBeenCalledTimes(2);
  });

  it('efface l’objet avatar du stockage (ADR-15, TLX-124)', async () => {
    const { service, deleteObject } = setup([{ id: 'u1', photoUrl: 'avatars/u1/abc' }]);

    await service.purgeExpired();

    expect(deleteObject).toHaveBeenCalledWith('avatars/u1/abc');
  });

  it('ne tente aucune suppression de stockage sans avatar', async () => {
    const { service, deleteObject } = setup([{ id: 'u1', photoUrl: null }]);

    await service.purgeExpired();

    expect(deleteObject).not.toHaveBeenCalled();
  });
});
