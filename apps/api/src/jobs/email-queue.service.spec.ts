import type { ConfigService } from '@nestjs/config';
import { EmailQueueService } from './email-queue.service';
import { EMAIL_JOB_NAME } from './jobs.constants';

describe('EmailQueueService', () => {
  function makeService(add: jest.Mock): EmailQueueService {
    const config = {
      get: (key: string) => (key === 'REDIS_URL' ? 'redis://localhost:6379' : undefined),
    } as unknown as ConfigService;
    const service = new EmailQueueService(config);
    // Stub la Queue BullMQ pour ne pas ouvrir de connexion Redis.
    (service as unknown as { queue: () => unknown }).queue = () => ({ add });
    return service;
  }

  it('enfile l’email de réinitialisation avec le jeton en clair dans les params', async () => {
    const add = jest.fn().mockResolvedValue(undefined);
    const service = makeService(add);

    await service.enqueuePasswordReset('a@e.test', 'raw-token');

    expect(add).toHaveBeenCalledTimes(1);
    const [name, payload, opts] = add.mock.calls[0];
    expect(name).toBe(EMAIL_JOB_NAME);
    expect(payload).toEqual({
      kind: 'password_reset',
      to: 'a@e.test',
      params: { token: 'raw-token' },
    });
    expect(opts).toMatchObject({ attempts: 3 });
  });

  it('une panne d’enqueue (Redis) ne propage pas l’erreur (réponse neutre préservée)', async () => {
    const add = jest.fn().mockRejectedValue(new Error('redis down'));
    const service = makeService(add);

    await expect(service.enqueuePasswordReset('a@e.test', 'raw-token')).resolves.toBeUndefined();
  });
});
