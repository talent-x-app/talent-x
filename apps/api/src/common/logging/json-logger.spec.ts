import { JsonLogger } from './json-logger';

/** Capture la dernière ligne JSON écrite sur stdout/stderr. */
function captureLine(stream: 'stdout' | 'stderr', fn: () => void): Record<string, unknown> {
  let written = '';
  const spy = jest.spyOn(process[stream], 'write').mockImplementation((chunk: unknown) => {
    written = String(chunk);
    return true;
  });
  try {
    fn();
  } finally {
    spy.mockRestore();
  }
  return JSON.parse(written) as Record<string, unknown>;
}

describe('JsonLogger', () => {
  const logger = new JsonLogger();

  it('émet une ligne JSON structurée (time/level/message) sur stdout', () => {
    const record = captureLine('stdout', () => logger.log('hello', 'Ctx'));
    expect(record).toMatchObject({ level: 'log', message: 'hello', context: 'Ctx' });
    expect(typeof record.time).toBe('string');
  });

  it('route les erreurs sur stderr', () => {
    const record = captureLine('stderr', () => logger.error('boom', 'stack', 'Ctx'));
    expect(record).toMatchObject({ level: 'error', message: 'boom', trace: 'stack' });
  });

  it('masque les clés sensibles d’un message objet (TX-SEC-003 §11/§14)', () => {
    const record = captureLine('stdout', () =>
      logger.log({
        userId: 'u1',
        password: 'p@ss',
        refreshToken: 'opaque',
        authorization: 'Bearer x',
        nested: { secret: 's', keep: 'ok' },
      }),
    );
    expect(record.message).toEqual({
      userId: 'u1',
      password: '[redacted]',
      refreshToken: '[redacted]',
      authorization: '[redacted]',
      nested: { secret: '[redacted]', keep: 'ok' },
    });
  });

  it('laisse les messages scalaires inchangés', () => {
    const record = captureLine('stdout', () => logger.log('plain string'));
    expect(record.message).toBe('plain string');
  });
});
