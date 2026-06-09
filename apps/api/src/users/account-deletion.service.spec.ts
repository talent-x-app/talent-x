import type { PrismaService } from '../prisma/prisma.service';
import { AccountDeletionService } from './account-deletion.service';

function setup() {
  // $transaction reçoit un tableau d'opérations ; on capture les "ops" produites
  // par les appels mockés pour les inspecter.
  const userUpdateMany = jest.fn().mockReturnValue({ op: 'user.updateMany' });
  const refreshUpdateMany = jest.fn().mockReturnValue({ op: 'refresh.updateMany' });
  const deviceUpdateMany = jest.fn().mockReturnValue({ op: 'device.updateMany' });
  const auditCreate = jest.fn().mockReturnValue({ op: 'audit.create' });
  const transaction = jest.fn().mockResolvedValue([]);
  const prisma = {
    user: { updateMany: userUpdateMany },
    refreshToken: { updateMany: refreshUpdateMany },
    deviceToken: { updateMany: deviceUpdateMany },
    auditLog: { create: auditCreate },
    $transaction: transaction,
  } as unknown as PrismaService;
  return {
    service: new AccountDeletionService(prisma),
    userUpdateMany,
    refreshUpdateMany,
    deviceUpdateMany,
    auditCreate,
    transaction,
  };
}

describe('AccountDeletionService', () => {
  it('soft-delete + révoque tokens + journalise + accusé 202', async () => {
    const s = setup();

    const result = await s.service.requestDeletion('user-9');

    expect(result.status).toBe('pending');
    expect(typeof result.jobId).toBe('string');
    expect(result.jobId.length).toBeGreaterThan(0);

    // Soft-delete idempotent : where deletedAt null.
    expect(s.userUpdateMany).toHaveBeenCalledWith({
      where: { id: 'user-9', deletedAt: null },
      data: { deletedAt: expect.any(Date) },
    });
    // Révocation des deux types de tokens.
    expect(s.refreshUpdateMany).toHaveBeenCalledWith({
      where: { userId: 'user-9', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(s.deviceUpdateMany).toHaveBeenCalledWith({
      where: { userId: 'user-9', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    // Audit account.deletion.
    expect(s.auditCreate).toHaveBeenCalledWith({
      data: {
        actorId: 'user-9',
        action: 'account.deletion',
        entityType: 'user',
        entityId: 'user-9',
      },
    });
    // Le tout dans une transaction.
    expect(s.transaction).toHaveBeenCalledTimes(1);
  });
});
