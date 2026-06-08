import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../prisma/prisma.service';
import type { ObjectStorageService } from '../storage/object-storage.service';
import { ExportProcessor } from './export.processor';
import type { ExportArchive, ExportArchiveBuilder } from './export-archive-builder';

function setup(builderImpl: () => Promise<ExportArchive>) {
  const update = jest.fn().mockResolvedValue({});
  const prisma = { exportJob: { update } } as unknown as PrismaService;
  const putObject = jest.fn().mockResolvedValue(undefined);
  const storage = { putObject } as unknown as ObjectStorageService;
  const builder = { build: jest.fn(builderImpl) } as unknown as ExportArchiveBuilder;
  const config = {
    get: (key: string) => (key === 'EXPORT_ARCHIVE_TTL_HOURS' ? 24 : undefined),
  } as unknown as ConfigService;
  return {
    processor: new ExportProcessor(prisma, storage, builder, config),
    update,
    putObject,
  };
}

describe('ExportProcessor', () => {
  it('succès : processing → dépôt archive → ready avec object_key et expires_at', async () => {
    const archive: ExportArchive = {
      body: '{"data":1}',
      contentType: 'application/json',
      filename: 'export.json',
    };
    const { processor, update, putObject } = setup(() => Promise.resolve(archive));

    await processor.process({ jobId: 'job-1', userId: 'user-9' });

    expect(update.mock.calls[0][0]).toEqual({
      where: { id: 'job-1' },
      data: { status: 'processing' },
    });
    expect(putObject).toHaveBeenCalledWith(
      'exports/user-9/job-1.json',
      '{"data":1}',
      'application/json',
    );
    const ready = update.mock.calls[1][0];
    expect(ready.where).toEqual({ id: 'job-1' });
    expect(ready.data.status).toBe('ready');
    expect(ready.data.objectKey).toBe('exports/user-9/job-1.json');
    expect(ready.data.expiresAt).toBeInstanceOf(Date);
  });

  it('échec : builder qui jette → failed avec message, et l’erreur est propagée', async () => {
    const { processor, update, putObject } = setup(() =>
      Promise.reject(new Error('builder absent')),
    );

    await expect(processor.process({ jobId: 'job-2', userId: 'user-1' })).rejects.toThrow(
      'builder absent',
    );

    expect(putObject).not.toHaveBeenCalled();
    const failed = update.mock.calls[1][0];
    expect(failed.data).toEqual({ status: 'failed', error: 'builder absent' });
  });
});
