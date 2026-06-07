import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

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
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health → 200', () => {
    return request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect({ status: 'ok' });
  });

  it('GET /api/v1/ready → 200', () => {
    return request(app.getHttpServer())
      .get('/api/v1/ready')
      .expect(200)
      .expect({ status: 'ready' });
  });

  it('POST /api/v1/auth/register (payload valide) → 501 NOT_IMPLEMENTED', () => {
    return request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: 'coach@example.com', password: 'SecureP@ss123', role: 'coach' })
      .expect(501)
      .expect((res) => {
        expect(res.body.error).toBe('NOT_IMPLEMENTED');
        expect(res.body.path).toBe('/api/v1/auth/register');
      });
  });

  it('POST /api/v1/auth/register (payload invalide) → 422 + details', () => {
    return request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: 'pas-un-email', password: 'court' })
      .expect(422)
      .expect((res) => {
        expect(res.body.error).toBe('VALIDATION_FAILED');
        expect(Array.isArray(res.body.details)).toBe(true);
        expect(res.body.details.length).toBeGreaterThan(0);
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

  it('GET /api/v1/groups (stub protégé) → 501', () => {
    return request(app.getHttpServer()).get('/api/v1/groups').expect(501);
  });

  it('GET /api/v1/inconnu → 404 enveloppe normalisée', () => {
    return request(app.getHttpServer())
      .get('/api/v1/inconnu')
      .expect(404)
      .expect((res) => {
        expect(res.body.error).toBe('NOT_FOUND');
        expect(res.body.statusCode).toBe(404);
      });
  });
});
