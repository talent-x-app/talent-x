import { configureApiClient, customFetch, resetApiClient } from './custom-fetch';

// Tests du mutator (TLX-008) : URL de base, en-têtes dynamiques, enveloppe de
// réponse, parsing JSON/204. `fetch` global est mocké (pas d'appel réseau).

function mockResponse(
  body: string | null,
  init: { status?: number; contentType?: string } = {},
): Response {
  const headers = new Headers();
  if (init.contentType) headers.set('content-type', init.contentType);
  const status = init.status ?? 200;
  // Un corps est interdit pour les statuts « null body » (204/205/304).
  return new Response(status === 204 || status === 205 || status === 304 ? null : body, {
    status,
    headers,
  });
}

describe('customFetch (mutator du client API)', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    resetApiClient();
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it("préfixe l'URL de base configurée sans doubler les slashes", async () => {
    configureApiClient({ baseUrl: 'https://api.test/api/v1/' });
    fetchMock.mockResolvedValue(mockResponse('{}', { contentType: 'application/json' }));

    await customFetch('/auth/login', { method: 'POST' });

    expect(fetchMock).toHaveBeenCalledWith('https://api.test/api/v1/auth/login', expect.anything());
  });

  it('injecte les en-têtes dynamiques (seam auth)', async () => {
    configureApiClient({
      baseUrl: 'https://api.test',
      getHeaders: () => ({ Authorization: 'Bearer abc' }),
    });
    fetchMock.mockResolvedValue(mockResponse('{}', { contentType: 'application/json' }));

    await customFetch('/users/me', { headers: { 'X-Trace': '1' } });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers).toMatchObject({ Authorization: 'Bearer abc', 'X-Trace': '1' });
  });

  it("renvoie l'enveloppe { status, data, headers } et parse le JSON", async () => {
    fetchMock.mockResolvedValue(
      mockResponse('{"id":"u1"}', { status: 200, contentType: 'application/json' }),
    );

    const res = await customFetch<{ status: number; data: { id: string } }>('/users/me');

    expect(res.status).toBe(200);
    expect(res.data).toEqual({ id: 'u1' });
  });

  it('expose les statuts d’erreur sans lever (union orval)', async () => {
    fetchMock.mockResolvedValue(
      mockResponse('{"error":"NOT_FOUND"}', { status: 404, contentType: 'application/json' }),
    );

    const res = await customFetch<{ status: number; data: unknown }>('/groups/x');

    expect(res.status).toBe(404);
    expect(res.data).toEqual({ error: 'NOT_FOUND' });
  });

  it('gère une réponse 204 sans corps', async () => {
    fetchMock.mockResolvedValue(mockResponse(null, { status: 204 }));

    const res = await customFetch<{ status: number; data: unknown }>('/auth/logout');

    expect(res.status).toBe(204);
    expect(res.data).toBeUndefined();
  });

  it('rejoue une fois la requête après un 401 si le refresh réussit', async () => {
    const refreshAuth = jest.fn().mockResolvedValue(true);
    configureApiClient({ baseUrl: 'https://api.test', refreshAuth });
    fetchMock
      .mockResolvedValueOnce(
        mockResponse('{"error":"UNAUTHORIZED"}', { status: 401, contentType: 'application/json' }),
      )
      .mockResolvedValueOnce(
        mockResponse('{"id":"u1"}', { status: 200, contentType: 'application/json' }),
      );

    const res = await customFetch<{ status: number; data: { id: string } }>('/users/me');

    expect(refreshAuth).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ id: 'u1' });
  });

  it('ne rejoue pas si le refresh échoue (renvoie le 401)', async () => {
    const refreshAuth = jest.fn().mockResolvedValue(false);
    configureApiClient({ baseUrl: 'https://api.test', refreshAuth });
    fetchMock.mockResolvedValue(
      mockResponse('{"error":"UNAUTHORIZED"}', { status: 401, contentType: 'application/json' }),
    );

    const res = await customFetch<{ status: number; data: unknown }>('/users/me');

    expect(refreshAuth).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(401);
  });

  it('ne tente pas de refresh sans hook refreshAuth configuré', async () => {
    configureApiClient({ baseUrl: 'https://api.test' });
    fetchMock.mockResolvedValue(
      mockResponse('{"error":"UNAUTHORIZED"}', { status: 401, contentType: 'application/json' }),
    );

    const res = await customFetch<{ status: number; data: unknown }>('/users/me');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(401);
  });
});
