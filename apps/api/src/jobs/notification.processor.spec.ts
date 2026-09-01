import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { NotificationProcessor } from './notification.processor';
import type { PushProvider } from './push-provider';

type PrismaMock = {
  notificationPreferences: Record<string, jest.Mock>;
  deviceToken: Record<string, jest.Mock>;
  notification: Record<string, jest.Mock>;
};

function prismaMock(): PrismaMock {
  return {
    notificationPreferences: { findUnique: jest.fn().mockResolvedValue(null) },
    deviceToken: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    notification: { create: jest.fn().mockResolvedValue({}) },
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
  dedupeKey: 'session_assigned--asg-1',
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

  it('préférence off → ni push ni entrée in-app (silence total, ADR-23)', async () => {
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
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('persiste l’entrée in-app (clé dedupe_key) même sans device actif', async () => {
    const prisma = prismaMock();
    const provider = providerMock();
    prisma.deviceToken.findMany.mockResolvedValue([]);

    await make(prisma, provider).process(PAYLOAD);

    // TLX-267 : `create` et non `upsert` — c'est le fait d'avoir **créé** qui décide du push,
    // et un `upsert` Prisma ne le rapporte pas. L'unicité de `dedupeKey` reste la garde.
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: {
        userId: 'u-1',
        type: 'session_assigned',
        resourceId: 'asg-1',
        actorId: null,
        dedupeKey: 'session_assigned--asg-1',
      },
    });
    expect(provider.send).not.toHaveBeenCalled();
  });

  it('persiste l’actorId (ADR-55) quand le payload le porte ; push toujours générique', async () => {
    const prisma = prismaMock();
    const provider = providerMock();
    prisma.deviceToken.findMany.mockResolvedValue(DEVICES);

    await make(prisma, provider).process({ ...PAYLOAD, actorId: 'actor-9' });

    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ actorId: 'actor-9' }) }),
    );
    // Le push ne porte jamais le nom : data = { type, resourceId } seulement (ADR-10/55).
    const [, message] = (provider.send as jest.Mock).mock.calls[0];
    expect(message.data).toEqual({ type: 'session_assigned', resourceId: 'asg-1' });
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

  it('performance_submitted (TLX-139) : message coach dédié, gardé par performanceSubmitted', async () => {
    const prisma = prismaMock();
    const provider = providerMock();
    // Seul performanceSubmitted est off → la notification est silencieuse.
    prisma.notificationPreferences.findUnique.mockResolvedValue({
      userId: 'u-1',
      sessionAssigned: true,
      performanceFeedback: true,
      performanceSubmitted: false,
      groupUpdates: true,
      marketing: false,
    });
    prisma.deviceToken.findMany.mockResolvedValue(DEVICES);

    await make(prisma, provider).process({
      ...PAYLOAD,
      type: 'performance_submitted',
      dedupeKey: 'performance_submitted--asg-1',
    });

    expect(provider.send).not.toHaveBeenCalled();
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('performance_submitted : envoi avec le libellé coach quand la préférence est active', async () => {
    const prisma = prismaMock();
    const provider = providerMock();
    prisma.deviceToken.findMany.mockResolvedValue(DEVICES);

    await make(prisma, provider).process({
      ...PAYLOAD,
      type: 'performance_submitted',
      dedupeKey: 'performance_submitted--asg-1',
    });

    const [, message] = (provider.send as jest.Mock).mock.calls[0];
    expect(message.title).toBe('Performance à revoir');
    expect(message.data).toEqual({ type: 'performance_submitted', resourceId: 'asg-1' });
  });

  it('aucun device actif → aucun envoi', async () => {
    const prisma = prismaMock();
    const provider = providerMock();
    prisma.deviceToken.findMany.mockResolvedValue([]);

    await make(prisma, provider).process(PAYLOAD);
    expect(provider.send).not.toHaveBeenCalled();
  });

  /**
   * TLX-267 — le push ne part que si l'entrée de feed est **neuve**.
   *
   * Mesuré sur appareil (QA-04.6) : Alex retire puis renvoie son kudos ; Zoe reçoit une seconde
   * bannière à `12:42:30` alors que son feed reste daté `12:39:02` et **déjà lu** depuis
   * `12:41:34`. Elle est prévenue d'un encouragement introuvable dans l'app. Le `dedupe_key`
   * étant stable à vie, l'écriture retombait sur la ligne existante pendant que le push, hors de
   * ce chemin, partait à chaque job.
   *
   * Le test compte les appels au **provider push**, pas les lignes en base : c'est l'écart entre
   * les deux qui est le défaut. Un test qui ne regarde que `notifications` était vert avant le
   * correctif — la déduplication du feed, elle, a toujours fonctionné.
   */
  describe('push conditionné à la création de l’entrée (TLX-267)', () => {
    /** Violation d'unicité Prisma sur `dedupeKey` — ce que renvoie la base au second geste. */
    function uniqueViolation() {
      return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      });
    }

    it('même dedupeKey une seconde fois → aucune bannière, aucune ligne de plus', async () => {
      const prisma = prismaMock();
      const provider = providerMock();
      prisma.deviceToken.findMany.mockResolvedValue(DEVICES);
      // 1er geste : la ligne est créée. 2nd geste (retrait puis renvoi) : même clé → collision.
      prisma.notification.create.mockResolvedValueOnce({}).mockRejectedValueOnce(uniqueViolation());
      const processor = make(prisma, provider);

      await processor.process(PAYLOAD);
      await processor.process(PAYLOAD);

      expect(prisma.notification.create).toHaveBeenCalledTimes(2);
      expect(provider.send).toHaveBeenCalledTimes(1);
    });

    it('un job rejoué par la file ne pousse plus non plus — comportement voulu', async () => {
      // C'est un changement pour **tous** les types, pas seulement les kudos : le `dedupe_key`
      // existait déjà pour qu'un rejeu ne crée pas de doublon en base ; il évite désormais aussi
      // la bannière en double. Aucun type n'émet la même clé pour deux événements distincts.
      const prisma = prismaMock();
      const provider = providerMock();
      prisma.deviceToken.findMany.mockResolvedValue(DEVICES);
      prisma.notification.create.mockRejectedValue(uniqueViolation());

      await make(prisma, provider).process({ ...PAYLOAD, type: 'performance_feedback' });

      expect(provider.send).not.toHaveBeenCalled();
    });

    it('une erreur de base qui n’est pas une collision remonte, elle n’est pas avalée', async () => {
      // Sans cette garde, une panne d'écriture passerait pour un doublon : le job serait acquitté
      // en silence, sans entrée de feed ni push, et la file ne le rejouerait jamais.
      const prisma = prismaMock();
      const provider = providerMock();
      prisma.notification.create.mockRejectedValue(new Error('base injoignable'));

      await expect(make(prisma, provider).process(PAYLOAD)).rejects.toThrow('base injoignable');
      expect(provider.send).not.toHaveBeenCalled();
    });
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
