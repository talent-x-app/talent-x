import type { ConfigService } from '@nestjs/config';
import { ExportQueueService } from './export-queue.service';
import { EXPORT_JOB_NAME } from './jobs.constants';

describe('ExportQueueService', () => {
  function makeService(): { service: ExportQueueService; add: jest.Mock } {
    const config = {
      get: (key: string) => (key === 'REDIS_URL' ? 'redis://localhost:6379' : undefined),
    } as unknown as ConfigService;
    const service = new ExportQueueService(config);
    const add = jest.fn().mockResolvedValue(undefined);
    // Stub la Queue BullMQ pour ne pas ouvrir de connexion Redis.
    (service as unknown as { queue: () => unknown }).queue = () => ({ add });
    return { service, add };
  }

  it('enfile un job d’export avec le payload et un jobId idempotent', async () => {
    const { service, add } = makeService();
    await service.enqueueExport('job-1', 'user-9');

    expect(add).toHaveBeenCalledTimes(1);
    const [name, payload, opts] = add.mock.calls[0];
    expect(name).toBe(EXPORT_JOB_NAME);
    expect(payload).toEqual({ jobId: 'job-1', userId: 'user-9' });
    expect(opts).toMatchObject({ jobId: 'job-1' });
  });
});
