import type { PrismaService } from '../prisma/prisma.service';
import { NotificationProcessor } from './notification.processor';
import type { PushProvider } from './push-provider';

type PrismaMock = {
  notificationPreferences: Record<string, jest.Mock>;
  deviceToken: Record<string, jest.Mock>;
};

function prismaMock(): PrismaMock {
  return {
    notificationPreferences: { findUnique: jest.fn().mockResolvedValue(null) },
    deviceToken: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

function providerMock(invalidTokens: string[] = []): PushProvider {
  return { send: jest.fn().mockResolvedValue({ invalidTokens }) } as unknown as PushProvider;
}

function make(prisma: PrismaMock, provider = providerMock()): NotificationProcessor {
  return new NotificationProcessor(prisma as unknown as PrismaService, provider);
}

const PAYLOAD = {
  type: 'session_assigned' as const,
  recipientUserId: 'u-1',
  resourceId: 'asg-1',
};

const DEVICES = [
  { token: 'tok-1', platform: 'fcm' },
  { token: 'tok-2', platform: 'apns' },
];

describe('NotificationProcessor (TLX-110, ADR-22)', () => {
  it('envoie aux devices actifs avec un contenu générique (ADR-10 : signal + resourceId)', async () => {
    const prisma = prismaMock();
    const provider = providerMock();
    prisma.deviceToken.findMany.mockResolvedValue(DEVICES);

    await make(prisma, provider).process(PAYLOAD);

    expect(prisma.deviceToken.findMany).toHaveBeenCalledWith({
      where: { userId: 'u-1', revokedAt: null },
      select: { token: true, platform: true },
    });
    const [targets, message] = (provider.send as jest.Mock).mock.calls[0];
    expect(targets).toEqual(DEVICES);
    expect(message.data).toEqual({ type: 'session_assigned', resourceId: 'asg-1' });
    // Jamais de donnée métier : le contenu est un libellé fixe par type.
    expect(message.title).toBe('Nouvelle séance');
  });

  it('absence de ligne de préférences = défauts → envoi', async () => {
    const prisma = prismaMock();
    const provider = providerMock();
    prisma.notificationPreferences.findUnique.mockResolvedValue(null);
    prisma.deviceToken.findMany.mockResolvedValue(DEVICES);

    await make(prisma, provider).process(PAYLOAD);
    expect(provider.send).toHaveBeenCalledTimes(1);
  });

  it('préférence off → aucun envoi (garde par type)', async () => {
    const prisma = prismaMock();
    const provider = providerMock();
    prisma.notificationPreferences.findUnique.mockResolvedValue({
      userId: 'u-1',
      sessionAssigned: false,
      performanceFeedback: true,
      groupUpdates: true,
      marketing: false,
    });
    prisma.deviceToken.findMany.mockResolvedValue(DEVICES);

    await make(prisma, provider).process(PAYLOAD);

    expect(provider.send).not.toHaveBeenCalled();
  });

  it('la garde est celle du type : performance_feedback passe si seul sessionAssigned est off', async () => {
    const prisma = prismaMock();
    const provider = providerMock();
    prisma.notificationPreferences.findUnique.mockResolvedValue({
      userId: 'u-1',
      sessionAssigned: false,
      performanceFeedback: true,
      groupUpdates: true,
      marketing: false,
    });
    prisma.deviceToken.findMany.mockResolvedValue(DEVICES);

    await make(prisma, provider).process({ ...PAYLOAD, type: 'performance_feedback' });
    expect(provider.send).toHaveBeenCalledTimes(1);
  });

  it('aucun device actif → aucun envoi', async () => {
    const prisma = prismaMock();
    const provider = providerMock();
    prisma.deviceToken.findMany.mockResolvedValue([]);

    await make(prisma, provider).process(PAYLOAD);
    expect(provider.send).not.toHaveBeenCalled();
  });

  it('révoque les tokens signalés invalides par le provider', async () => {
    const prisma = prismaMock();
    const provider = providerMock(['tok-2']);
    prisma.deviceToken.findMany.mockResolvedValue(DEVICES);

    await make(prisma, provider).process(PAYLOAD);

    const arg = prisma.deviceToken.updateMany.mock.calls[0][0];
    expect(arg.where).toEqual({ token: { in: ['tok-2'] } });
    expect(arg.data.revokedAt).toBeInstanceOf(Date);
  });
});
