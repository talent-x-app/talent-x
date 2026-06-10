import { randomUUID } from 'node:crypto';
import {
  ForbiddenException,
  HttpStatus,
  INestApplication,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { validationExceptionFactory } from '../src/common/validation/validation-exception.factory';
import { PrismaService } from '../src/prisma/prisma.service';
import { OwnershipService } from '../src/common/authorization/ownership.service';
import { ConsentGate } from '../src/common/authorization/consent.gate';
import { hashRefreshToken } from '../src/auth/token.service';

/**
 * Tests d'INTÉGRATION DB-backed (TLX-79) : exécutent les chemins nominaux contre
 * une VRAIE base Postgres (migrée), là où les tests unitaires mockent Prisma.
 * Couvre TLX-021 (register), TLX-022/023 (login/refresh), TLX-024 (OwnershipService),
 * TLX-031 (ConsentsService append-only) et TLX-032 (ConsentGate).
 *
 * Auto-suffisant : crée ses fixtures (e-mails uniques) et les nettoie en fin de suite.
 */
describe('Auth & RGPD (intégration DB)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ownership: OwnershipService;
  let consentGate: ConsentGate;
  const createdUserIds: string[] = [];

  const uniqueEmail = (): string => `int-${randomUUID()}@ex.test`;
  const PASSWORD = 'Sup3rSecret!';

  /** Enregistre un compte via HTTP et mémorise l'id pour le nettoyage. */
  async function register(role: 'coach' | 'athlete', email = uniqueEmail()) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: PASSWORD, role, firstName: 'Int', lastName: 'Test' });
    if (res.status === 201 && res.body.user?.id) {
      createdUserIds.push(res.body.user.id);
    }
    return res;
  }

  /** Crée un utilisateur directement en base (fixtures Ownership). */
  async function createUser(role: 'coach' | 'athlete'): Promise<string> {
    const u = await prisma.user.create({
      data: { email: uniqueEmail(), passwordHash: 'x', role, firstName: 'F', lastName: 'L' },
    });
    createdUserIds.push(u.id);
    return u.id;
  }

  beforeAll(async () => {
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

    prisma = app.get(PrismaService);
    ownership = app.get(OwnershipService);
    consentGate = app.get(ConsentGate);

    // Garde-fou : ces tests exigent une vraie base joignable.
    await prisma.$queryRaw`SELECT 1`;
  });

  afterAll(async () => {
    if (prisma && createdUserIds.length > 0) {
      const ids = createdUserIds;
      // Suppression FK-safe des fixtures (les coachs sont référencés par Restrict).
      await prisma.comment.deleteMany({ where: { authorId: { in: ids } } });
      await prisma.performance.deleteMany({ where: { athleteId: { in: ids } } });
      await prisma.sessionAssignment.deleteMany({ where: { athleteId: { in: ids } } });
      await prisma.session.deleteMany({ where: { coachId: { in: ids } } });
      await prisma.coachAthleteLink.deleteMany({
        where: { OR: [{ coachId: { in: ids } }, { athleteId: { in: ids } }] },
      });
      await prisma.groupMember.deleteMany({ where: { athleteId: { in: ids } } });
      await prisma.group.deleteMany({ where: { coachId: { in: ids } } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }
    await app?.close();
  });

  describe('TLX-021 — POST /auth/register', () => {
    it('crée le compte, émet les jetons et persiste le refresh haché', async () => {
      const email = uniqueEmail();
      const res = await register('athlete', email);

      expect(res.status).toBe(201);
      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body.refreshToken).toEqual(expect.any(String));
      expect(res.body.user.email).toBe(email);

      // Le refresh est persisté HACHÉ (jamais en clair).
      const stored = await prisma.refreshToken.findFirst({ where: { userId: res.body.user.id } });
      expect(stored).not.toBeNull();
      expect(stored!.tokenHash).toBe(hashRefreshToken(res.body.refreshToken));
      expect(stored!.tokenHash).not.toBe(res.body.refreshToken);
    });

    it('rejette un e-mail déjà pris, insensible à la casse → 409', async () => {
      const email = uniqueEmail();
      await register('coach', email);
      const dup = await register('coach', email.toUpperCase());
      expect(dup.status).toBe(409);
    });
  });

  describe('TLX-022/023 — login & refresh', () => {
    it('login nominal → 200 + jetons ; mauvais mot de passe → 401', async () => {
      const email = uniqueEmail();
      await register('athlete', email);

      const ok = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: PASSWORD });
      expect(ok.status).toBe(200);
      expect(ok.body.accessToken).toEqual(expect.any(String));

      const ko = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: 'mauvais-mot-de-passe' });
      expect(ko.status).toBe(401);
      expect(ko.body.error).toBe('INVALID_CREDENTIALS');
    });

    it('refresh : rotation puis détection de réutilisation (409 + famille révoquée)', async () => {
      const reg = await register('athlete');
      const first = reg.body.refreshToken;

      // Rotation : le jeton est consommé, un nouveau est émis.
      const rotated = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: first });
      expect(rotated.status).toBe(200);
      expect(rotated.body.refreshToken).not.toBe(first);

      // Réutilisation du jeton déjà consommé → 409 + révocation de toute la famille.
      const reused = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: first });
      expect(reused.status).toBe(409);

      const active = await prisma.refreshToken.count({
        where: { userId: reg.body.user.id, revokedAt: null },
      });
      expect(active).toBe(0);
    });
  });

  describe('TLX-031 — consentements append-only', () => {
    it('chaque PUT ajoute une ligne ; l’état courant = dernière par (user, type)', async () => {
      const reg = await register('athlete');
      const token = reg.body.accessToken;
      const userId = reg.body.user.id;
      const auth = { Authorization: `Bearer ${token}` };

      await request(app.getHttpServer())
        .put('/api/v1/users/me/consents')
        .set(auth)
        .send({ type: 'data_processing', granted: true })
        .expect(200);
      await request(app.getHttpServer())
        .put('/api/v1/users/me/consents')
        .set(auth)
        .send({ type: 'data_processing', granted: false })
        .expect(200);

      // Append-only : 2 lignes pour (user, data_processing).
      const rows = await prisma.consent.count({ where: { userId, type: 'data_processing' } });
      expect(rows).toBe(2);

      // État courant via l'API = dernière ligne (granted=false), revokedAt persisté.
      const get = await request(app.getHttpServer())
        .get('/api/v1/users/me/consents')
        .set(auth)
        .expect(200);
      const current = get.body.data.find((c: { type: string }) => c.type === 'data_processing');
      expect(current.granted).toBe(false);

      const last = await prisma.consent.findFirst({
        where: { userId, type: 'data_processing' },
        orderBy: { createdAt: 'desc' },
      });
      expect(last!.revokedAt).not.toBeNull();
      expect(last!.textVersion).toEqual(expect.any(String));
    });

    it('le CHECK base rejette un type de consentement invalide', async () => {
      const userId = await createUser('athlete');
      await expect(
        prisma.consent.create({
          data: { userId, type: 'type_invalide', granted: true, textVersion: 'x' },
        }),
      ).rejects.toBeDefined();
    });
  });

  describe('TLX-032 — ConsentGate (dernière ligne fait foi)', () => {
    it('séquence accord → retrait → accord : consentement actif', async () => {
      const userId = await createUser('athlete');
      // `createdAt` explicites et strictement croissants : trois inserts en rafale peuvent
      // partager le même `now()` de transaction sur un runner rapide, rendant l'ordre
      // `createdAt desc` ambigu (flake CI). En prod, les consentements passent par l'API
      // (aller-retours HTTP sérialisés) — la collision n'existe pas.
      const base = Date.now() - 3_000;
      const sequence = [true, false, true];
      for (const [i, granted] of sequence.entries()) {
        await prisma.consent.create({
          data: {
            userId,
            type: 'coach_access',
            granted,
            textVersion: '2026-01',
            createdAt: new Date(base + i * 1_000),
          },
        });
      }
      await expect(consentGate.hasActiveConsent(userId, 'coach_access')).resolves.toBe(true);
      await expect(
        consentGate.assertActiveConsent(userId, 'coach_access'),
      ).resolves.toBeUndefined();
    });

    it('sans consentement actif → 403 CONSENT_REQUIRED', async () => {
      const userId = await createUser('athlete');
      await expect(consentGate.assertActiveConsent(userId, 'coach_access')).rejects.toMatchObject({
        response: { error: 'CONSENT_REQUIRED' },
      });
    });
  });

  describe('TLX-024 — OwnershipService (appartenance & ownership)', () => {
    it('appartenance coach↔athlète active vs absente', async () => {
      const coach = await createUser('coach');
      const athleteLinked = await createUser('athlete');
      const athleteOther = await createUser('athlete');
      await prisma.coachAthleteLink.create({
        data: { coachId: coach, athleteId: athleteLinked, source: 'direct' },
      });

      await expect(ownership.isCoachLinkedToAthlete(coach, athleteLinked)).resolves.toBe(true);
      await expect(ownership.isCoachLinkedToAthlete(coach, athleteOther)).resolves.toBe(false);
      await expect(
        ownership.assertCoachLinkedToAthlete(coach, athleteOther),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('ownership séance/groupe : 404 absent, 403 autre coach, OK propriétaire', async () => {
      const coach = await createUser('coach');
      const otherCoach = await createUser('coach');
      const group = await prisma.group.create({
        data: { coachId: coach, name: 'G', inviteCode: randomUUID().slice(0, 12) },
      });
      const session = await prisma.session.create({ data: { coachId: coach, title: 'S' } });

      await expect(ownership.assertGroupOwnedByCoach(coach, group.id)).resolves.toBeUndefined();
      await expect(ownership.assertSessionOwnedByCoach(coach, session.id)).resolves.toBeUndefined();

      // Inexistant → 404.
      await expect(ownership.assertSessionOwnedByCoach(coach, randomUUID())).rejects.toBeInstanceOf(
        NotFoundException,
      );
      // Existe mais autre propriétaire → 403.
      await expect(
        ownership.assertSessionOwnedByCoach(otherCoach, session.id),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(ownership.assertGroupOwnedByCoach(otherCoach, group.id)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('soft-delete masque la ressource → 404', async () => {
      const coach = await createUser('coach');
      const session = await prisma.session.create({
        data: { coachId: coach, title: 'S', deletedAt: new Date() },
      });
      await expect(ownership.assertSessionOwnedByCoach(coach, session.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
