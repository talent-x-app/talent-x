import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../prisma/prisma.service';
import { AccountPurgeService } from './account-purge.service';

function setup(candidates: Array<{ id: string }>) {
  const tagged = (op: string) => jest.fn().mockReturnValue({ op });
  const userUpdate = jest.fn().mockReturnValue({ op: 'user.update' });
  const findMany = jest.fn().mockResolvedValue(candidates);
  const transaction = jest.fn().mockResolvedValue([]);
  const prisma = {
    user: { findMany, update: userUpdate },
    performance: { deleteMany: tagged('perf') },
    groupMember: { deleteMany: tagged('gm') },
    coachAthleteLink: { deleteMany: tagged('cal') },
    deviceToken: { deleteMany: tagged('device') },
    refreshToken: { deleteMany: tagged('refresh') },
    exportJob: { deleteMany: tagged('export') },
    comment: { updateMany: tagged('comment') },
    auditLog: { create: tagged('audit') },
    $transaction: transaction,
  } as unknown as PrismaService;
  const config = { get: () => 30 } as unknown as ConfigService;
  return { service: new AccountPurgeService(prisma, config), findMany, userUpdate, transaction };
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

  it('poursuit le lot si une purge échoue', async () => {
    const { service, transaction } = setup([{ id: 'u1' }, { id: 'u2' }]);
    transaction.mockRejectedValueOnce(new Error('contrainte'));

    await expect(service.purgeExpired()).resolves.toBeUndefined();
    expect(transaction).toHaveBeenCalledTimes(2);
  });
});
