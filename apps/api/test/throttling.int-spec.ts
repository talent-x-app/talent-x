import { randomUUID } from 'node:crypto';
import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { validationExceptionFactory } from '../src/common/validation/validation-exception.factory';

/**
 * Rate limiting (TLX-233) — le test DÉPASSE réellement le seuil et constate le
 * 429, il ne se contente pas de vérifier que le garde est monté. Seuils bas et
 * fenêtre courte injectés par l'environnement AVANT la compilation du module
 * (les autres suites tournent throttling désactivé — défaut NODE_ENV=test).
 *
 * Avec REDIS_URL configuré (.env local, service CI), c'est le stockage Redis
 * réel qui est exercé ; sans lui, le stockage mémoire — mêmes assertions.
 */
describe('Rate limiting (intégration, TLX-233)', () => {
  let app: INestApplication;

  const STRICT_LIMIT = 3;
  const STRICT_TTL_SECONDS = 2;
  const TOUCHED_ENV = {
    THROTTLE_ENABLED: 'true',
    THROTTLE_STRICT_LIMIT: String(STRICT_LIMIT),
    THROTTLE_STRICT_TTL_SECONDS: String(STRICT_TTL_SECONDS),
    // Plafond global volontairement haut : seul le limiteur strict est visé ici.
    THROTTLE_LIMIT: '1000',
    THROTTLE_TTL_SECONDS: '60',
  } as const;
  const previousEnv: Record<string, string | undefined> = {};

  const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

  beforeAll(async () => {
    for (const [key, value] of Object.entries(TOUCHED_ENV)) {
      previousEnv[key] = process.env[key];
      process.env[key] = value;
    }

    // Import APRÈS la pose de l'environnement : ConfigModule.forRoot (et donc
    // validateEnv) s'exécute à l'import d'app.module.ts — un import statique
    // figerait la config avant la surcharge ci-dessus.
    const { AppModule } = await import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        exceptionFactory: validationExceptionFactory,
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    // Ne pas laisser fuiter la config vers les suites suivantes (--runInBand).
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('login : sous le seuil → 401 nominal, au-delà → 429, après la fenêtre → 401 à nouveau', async () => {
    const attempt = () =>
      request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: `throttle-${randomUUID()}@ex.test`, password: 'Wr0ngPassw0rd!' });

    // Chemin nominal préservé sous le seuil : identifiants invalides → 401, pas 429.
    for (let i = 0; i < STRICT_LIMIT; i += 1) {
      const res = await attempt();
      expect(res.status).toBe(401);
    }

    // Dépassement réel du seuil : la requête suivante est bloquée.
    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.body).toMatchObject({ statusCode: 429, error: 'TOO_MANY_REQUESTS' });
    expect(blocked.headers['retry-after-strict']).toBeDefined();

    // La fenêtre expire (ttl = blockDuration) : le service redevient joignable.
    await sleep(STRICT_TTL_SECONDS * 1000 + 300);
    const recovered = await attempt();
    expect(recovered.status).toBe(401);
  }, 15_000);

  it('forgot-password : compteur distinct, plafonné lui aussi (anti-inondation)', async () => {
    const attempt = () =>
      request(app.getHttpServer())
        .post('/api/v1/auth/forgot-password')
        .send({ email: `throttle-${randomUUID()}@ex.test` });

    // Réponse neutre 202 sous le seuil (adresse inconnue : aucun email émis).
    for (let i = 0; i < STRICT_LIMIT; i += 1) {
      const res = await attempt();
      expect(res.status).toBe(202);
    }

    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toBe('TOO_MANY_REQUESTS');
  });

  it('une route non marquée @StrictThrottle() ne subit que le plafond global', async () => {
    // Plus de requêtes que le seuil strict : aucune ne doit être bloquée.
    for (let i = 0; i < STRICT_LIMIT + 2; i += 1) {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: `jeton-invalide-${randomUUID()}` });
      expect(res.status).not.toBe(429);
    }
  });
});
