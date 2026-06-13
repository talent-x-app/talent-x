const mockCreate = jest.fn();
const mockConfirm = jest.fn();

jest.mock('@talent-x/api-client', () => ({
  createAvatarUpload: (...a: unknown[]) => mockCreate(...a),
  confirmAvatar: (...a: unknown[]) => mockConfirm(...a),
}));

import { uploadAvatar } from './avatar-upload';

function fetchImpl(putOk = true) {
  return jest.fn(async (input: unknown, init?: { method?: string }) => {
    if (init?.method === 'PUT') return { ok: putOk } as Response;
    // Lecture du fichier local → blob.
    return { blob: async () => ({ size: 3 }) } as unknown as Response;
  });
}

beforeEach(() => jest.clearAllMocks());

describe('uploadAvatar (TLX-124)', () => {
  it('présigne → PUT octets → confirme, renvoie le profil', async () => {
    mockCreate.mockResolvedValue({
      status: 201,
      data: { uploadUrl: 'https://s3/put', objectKey: 'avatars/u/abc', expiresAt: 'x' },
    });
    mockConfirm.mockResolvedValue({
      status: 200,
      data: { id: 'u', photoUrl: 'https://signed/abc' },
    });
    const fetchFn = fetchImpl();

    const user = await uploadAvatar(
      { uri: 'file:///tmp/a.jpg', mimeType: 'image/jpeg' },
      { fetchImpl: fetchFn },
    );

    expect(mockCreate).toHaveBeenCalledWith({ contentType: 'image/jpeg' });
    // PUT vers l'URL présignée, avec le bon Content-Type.
    const putCall = fetchFn.mock.calls.find((c) => (c[1] as { method?: string })?.method === 'PUT');
    expect(putCall?.[0]).toBe('https://s3/put');
    expect((putCall?.[1] as { headers: Record<string, string> }).headers['Content-Type']).toBe(
      'image/jpeg',
    );
    expect(mockConfirm).toHaveBeenCalledWith({ objectKey: 'avatars/u/abc' });
    expect(user.photoUrl).toBe('https://signed/abc');
  });

  it('lance si la demande d’URL échoue (pas de PUT ni de confirm)', async () => {
    mockCreate.mockResolvedValue({ status: 422, data: { error: 'INVALID_CONTENT_TYPE' } });
    const fetchFn = fetchImpl();

    await expect(
      uploadAvatar({ uri: 'file:///a', mimeType: 'image/gif' }, { fetchImpl: fetchFn }),
    ).rejects.toMatchObject({ status: 422 });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('lance si le PUT au stockage échoue (pas de confirm)', async () => {
    mockCreate.mockResolvedValue({
      status: 201,
      data: { uploadUrl: 'https://s3/put', objectKey: 'avatars/u/abc', expiresAt: 'x' },
    });
    const fetchFn = fetchImpl(false);

    await expect(
      uploadAvatar({ uri: 'file:///a', mimeType: 'image/png' }, { fetchImpl: fetchFn }),
    ).rejects.toMatchObject({ ok: false });
    expect(mockConfirm).not.toHaveBeenCalled();
  });
});
