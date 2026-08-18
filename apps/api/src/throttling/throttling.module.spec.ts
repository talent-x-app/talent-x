import type { ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { StrictThrottle } from '../common/decorators/strict-throttle.decorator';
import type { RedisThrottlerStorage } from './redis-throttler.storage';
import { buildThrottlerOptions } from './throttling.module';

/** ConfigService factice sur un simple record. */
const configMock = (values: Record<string, unknown>): ConfigService =>
  ({
    get: (key: string) => values[key],
    getOrThrow: (key: string) => {
      if (values[key] === undefined) throw new Error(`${key} manquant`);
      return values[key];
    },
  }) as unknown as ConfigService;

const storageMock = {} as RedisThrottlerStorage;

const enabledEnv = {
  THROTTLE_ENABLED: true,
  THROTTLE_TTL_SECONDS: 60,
  THROTTLE_LIMIT: 300,
  THROTTLE_STRICT_TTL_SECONDS: 900,
  THROTTLE_STRICT_LIMIT: 10,
};

/** Contexte d'exécution minimal pointant sur un handler donné. */
const contextFor = (handler: () => void): ExecutionContext =>
  ({ getHandler: () => handler }) as unknown as ExecutionContext;

describe('buildThrottlerOptions', () => {
  it('désactivé → aucun throttler (le garde laisse tout passer)', () => {
    const options = buildThrottlerOptions(configMock({ THROTTLE_ENABLED: false }), storageMock) as {
      throttlers: unknown[];
    };
    expect(options.throttlers).toEqual([]);
  });

  it('activé → throttler global (toutes routes) + strict (ttl en millisecondes)', () => {
    const options = buildThrottlerOptions(configMock(enabledEnv), storageMock) as {
      throttlers: Array<{ name: string; ttl: number; limit: number }>;
    };
    expect(options.throttlers).toHaveLength(2);
    const [global, strict] = options.throttlers;
    expect(global).toMatchObject({ name: 'global', ttl: 60_000, limit: 300 });
    expect(strict).toMatchObject({ name: 'strict', ttl: 900_000, limit: 10 });
  });

  it('le throttler strict ne s’applique qu’aux handlers @StrictThrottle()', () => {
    const options = buildThrottlerOptions(configMock(enabledEnv), storageMock) as {
      throttlers: Array<{ name: string; skipIf?: (context: ExecutionContext) => boolean }>;
    };
    const strict = options.throttlers.find((t) => t.name === 'strict');

    class FakeController {
      @StrictThrottle()
      sensitive(): void {}
      ordinary(): void {}
    }
    const proto = FakeController.prototype;

    expect(strict?.skipIf?.(contextFor(proto.sensitive))).toBe(false);
    expect(strict?.skipIf?.(contextFor(proto.ordinary))).toBe(true);
  });

  it('stockage Redis fourni dès que REDIS_URL est configuré, sinon défaut mémoire', () => {
    const withRedis = buildThrottlerOptions(
      configMock({ ...enabledEnv, REDIS_URL: 'redis://localhost:6379' }),
      storageMock,
    ) as { storage?: unknown };
    expect(withRedis.storage).toBe(storageMock);

    const withoutRedis = buildThrottlerOptions(configMock(enabledEnv), storageMock) as {
      storage?: unknown;
    };
    expect(withoutRedis.storage).toBeUndefined();
  });
});
