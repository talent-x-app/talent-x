import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { validationExceptionFactory } from '../src/common/validation/validation-exception.factory';

/**
 * e2e du squelette (TLX-011) : valide les comportements transverses (préfixe,
 * validation 422, enveloppe d'erreur, stubs 501, 404) et le câblage Auth.
 * Ne nécessite pas de base : PrismaService tolère l'absence de connexion.
 */
describe('API skeleton (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    // Mirroir de main.ts : `/metrics` est servi à la racine (endpoint de scrape),
    // hors préfixe `/api/v1` — l'intercepteur de métriques s'y exclut lui-même.
    app.setGlobalPrefix('api/v1', { exclude: ['metrics'] });
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
    await app.close();
  });

  it('GET /api/v1/health → 200 + en-tête X-Request-Id', () => {
    return request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect({ status: 'ok' })
      .expect((res) => {
        expect(res.headers['x-request-id']).toEqual(expect.any(String));
      });
  });

  it('GET /api/v1/ready (base indisponible en test) → 503 not_ready + checks', () => {
    return request(app.getHttpServer())
      .get('/api/v1/ready')
      .expect(503)
      .expect((res) => {
        expect(res.body.status).toBe('not_ready');
        // `redis` n'apparaît dans les checks que si REDIS_URL est configuré (TLX-110) :
        // absent en CI, présent en local (.env). Assertion agnostique à l'environnement.
        expect(res.body.checks.database).toBe(false);
        if ('redis' in res.body.checks) {
          expect(typeof res.body.checks.redis).toBe('boolean');
        }
      });
  });

  it('GET /metrics expose les métriques HTTP applicatives avec le gabarit de route', async () => {
    // Une requête métier alimente l'intercepteur global (route templatée par express).
    await request(app.getHttpServer()).get('/api/v1/health').expect(200);

    return request(app.getHttpServer())
      .get('/metrics')
      .expect(200)
      .expect((res) => {
        expect(res.headers['content-type']).toContain('text/plain');
        // Le label `route` porte le gabarit (`/api/v1/health`), pas l'URL brute.
        expect(res.text).toContain('# TYPE talentx_http_requests_total counter');
        expect(res.text).toMatch(
          /talentx_http_requests_total\{method="GET",route="\/api\/v1\/health",status="200"\}/,
        );
        expect(res.text).toContain('talentx_http_request_duration_seconds_bucket');
        // Le scrape de /metrics ne se compte pas lui-même.
        expect(res.text).not.toContain('route="/metrics"');
      });
  });

  it('réutilise le X-Request-Id fourni par le client', () => {
    return request(app.getHttpServer())
      .get('/api/v1/health')
      .set('X-Request-Id', 'corr-42')
      .expect(200)
      .expect((res) => {
        expect(res.headers['x-request-id']).toBe('corr-42');
      });
  });

  // register (TLX-021) est implémenté : le chemin nominal écrit en base et est
  // couvert par les tests unitaires (auth.service.spec). Ici, sans base, on
  // vérifie seulement la validation transverse (ne nécessite pas de DB).
  it('POST /api/v1/auth/register (payload invalide) → 422 + details', () => {
    return request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: 'pas-un-email', password: 'court' })
      .expect(422)
      .expect((res) => {
        expect(res.body.error).toBe('VALIDATION_FAILED');
        expect(Array.isArray(res.body.details)).toBe(true);
        expect(res.body.details.length).toBeGreaterThan(0);
        // details structurés conformes au schéma ValidationDetail.
        expect(res.body.details).toContainEqual(
          expect.objectContaining({ field: 'email', constraint: expect.any(String) }),
        );
      });
  });

  it('POST /api/v1/auth/register (champ inconnu) → 422 (forbidNonWhitelisted)', () => {
    return request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'coach@example.com',
        password: 'SecureP@ss123',
        role: 'coach',
        champInconnu: 'x',
      })
      .expect(422);
  });

  it('POST /api/v1/auth/refresh (sans refreshToken) → 422', () => {
    return request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({})
      .expect(422)
      .expect((res) => {
        expect(res.body.error).toBe('VALIDATION_FAILED');
      });
  });

  it('GET /api/v1/groups (route protégée, sans token) → 401', () => {
    return request(app.getHttpServer())
      .get('/api/v1/groups')
      .expect(401)
      .expect((res) => {
        expect(res.body.error).toBe('UNAUTHORIZED');
      });
  });

  it('GET /api/v1/groups (Bearer invalide) → 401 INVALID_TOKEN', () => {
    return request(app.getHttpServer())
      .get('/api/v1/groups')
      .set('Authorization', 'Bearer pas-un-vrai-jwt')
      .expect(401)
      .expect((res) => {
        expect(res.body.error).toBe('INVALID_TOKEN');
      });
  });

  it('GET /api/v1/inconnu → 404 enveloppe normalisée', () => {
    return request(app.getHttpServer())
      .get('/api/v1/inconnu')
      .expect(404)
      .expect((res) => {
        expect(res.body.error).toBe('NOT_FOUND');
        expect(res.body.statusCode).toBe(404);
        expect(res.body.requestId).toEqual(expect.any(String));
      });
  });
});
