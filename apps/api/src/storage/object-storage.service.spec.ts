import type { ConfigService } from '@nestjs/config';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ObjectStorageService } from './object-storage.service';

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

const S3_CONFIG: Record<string, string> = {
  S3_ENDPOINT: 'https://s3.gra.io.cloud.ovh.net',
  S3_REGION: 'gra',
  S3_BUCKET: 'talentx-exports',
  S3_ACCESS_KEY_ID: 'ak',
  S3_SECRET_ACCESS_KEY: 'sk',
};

function makeService(values = S3_CONFIG): { service: ObjectStorageService; send: jest.Mock } {
  const config = { get: (key: string) => values[key] } as unknown as ConfigService;
  const service = new ObjectStorageService(config);
  const send = jest.fn().mockResolvedValue({});
  // Stub le client S3 pour ne pas toucher au réseau.
  (service as unknown as { s3: () => unknown }).s3 = () => ({ send });
  return { service, send };
}

describe('ObjectStorageService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('putObject envoie un PutObjectCommand avec bucket/clé/contenu', async () => {
    const { service, send } = makeService();
    await service.putObject('exports/u/j.json', '{"a":1}', 'application/json');

    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0][0];
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toMatchObject({
      Bucket: 'talentx-exports',
      Key: 'exports/u/j.json',
      Body: '{"a":1}',
      ContentType: 'application/json',
    });
  });

  it('deleteObject envoie un DeleteObjectCommand', async () => {
    const { service, send } = makeService();
    await service.deleteObject('exports/u/j.json');

    const command = send.mock.calls[0][0];
    expect(command).toBeInstanceOf(DeleteObjectCommand);
    expect(command.input).toMatchObject({ Bucket: 'talentx-exports', Key: 'exports/u/j.json' });
  });

  it('getPresignedDownloadUrl signe un GetObjectCommand avec le TTL', async () => {
    const { service } = makeService();
    (getSignedUrl as jest.Mock).mockResolvedValue('https://signed.example/url');

    const url = await service.getPresignedDownloadUrl('exports/u/j.json', 3600);

    expect(url).toBe('https://signed.example/url');
    const [, command, opts] = (getSignedUrl as jest.Mock).mock.calls[0];
    expect(command).toBeInstanceOf(GetObjectCommand);
    expect(command.input).toMatchObject({ Bucket: 'talentx-exports', Key: 'exports/u/j.json' });
    expect(opts).toEqual({ expiresIn: 3600 });
  });

  it('échoue clairement si une variable S3 est absente', async () => {
    // Client réel (non stubbé) : la construction doit refuser une config vide.
    const bare = new ObjectStorageService({ get: () => undefined } as unknown as ConfigService);
    await expect(bare.putObject('k', 'b', 'application/json')).rejects.toThrow(
      /Configuration stockage objet absente/,
    );
  });
});
