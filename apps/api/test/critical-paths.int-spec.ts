import { randomUUID } from 'node:crypto';
import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { validationExceptionFactory } from '../src/common/validation/validation-exception.factory';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Tests E2E DB-backed des **parcours critiques** (TLX-120) : exécutent le cycle complet
 * coach↔athlète de bout en bout via HTTP (Supertest) contre une **vraie base** Postgres
 * migrée — là où les tests unitaires mockent Prisma et où `app.e2e-spec` ne valide que le
 * transverse sans base. Couvre les parcours auth → groupe → séance → affectation →
 * performance → revue → dérivations (dashboard / records / progression), l'idempotence des
 * écritures sensibles, et la matrice d'autorisation (RBAC + ownership + consentement).
 *
 * Auto-suffisant : crée ses fixtures (e-mails uniques) et les nettoie en fin de suite.
 * Prérequis : base joignable + migrée (local `docker compose` :5433 ; CI service `postgres`).
 */
describe('Parcours critiques (E2E DB) — TLX-120', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdUserIds: string[] = [];

  const uniqueEmail = (): string => `e2e-${randomUUID()}@ex.test`;
  const PASSWORD = 'Sup3rSecret!';
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const http = () => request(app.getHttpServer());

  /** Enregistre un compte via HTTP et mémorise l'id pour le nettoyage. */
  async function register(role: 'coach' | 'athlete') {
    const email = uniqueEmail();
    const res = await http()
      .post('/api/v1/auth/register')
      .send({ email, password: PASSWORD, role, firstName: 'E2E', lastName: role });
    expect(res.status).toBe(201);
    createdUserIds.push(res.body.user.id);
    return {
      id: res.body.user.id as string,
      token: res.body.accessToken as string,
      email,
    };
  }

  /** Athlète : accorde un consentement (dernière ligne fait foi, TLX-031/032). */
  async function grantConsent(
    token: string,
    type: 'data_processing' | 'coach_access',
    granted = true,
  ) {
    await http()
      .put('/api/v1/users/me/consents')
      .set(bearer(token))
      .send({ type, granted })
      .expect(200);
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
    // Garde-fou : ces tests exigent une vraie base joignable.
    await prisma.$queryRaw`SELECT 1`;
  });

  afterAll(async () => {
    if (prisma && createdUserIds.length > 0) {
      const ids = createdUserIds;
      // Suppression FK-safe (records → perfs ; perfs/affectations → séances ; coachs Restrict).
      await prisma.comment.deleteMany({ where: { authorId: { in: ids } } });
      await prisma.personalRecord.deleteMany({ where: { athleteId: { in: ids } } });
      await prisma.performance.deleteMany({ where: { athleteId: { in: ids } } });
      await prisma.sessionAssignment.deleteMany({ where: { athleteId: { in: ids } } });
      await prisma.session.deleteMany({ where: { coachId: { in: ids } } });
      await prisma.coachAthleteLink.deleteMany({
        where: { OR: [{ coachId: { in: ids } }, { athleteId: { in: ids } }] },
      });
      await prisma.groupMember.deleteMany({ where: { athleteId: { in: ids } } });
      await prisma.group.deleteMany({ where: { coachId: { in: ids } } });
      await prisma.consent.deleteMany({ where: { userId: { in: ids } } });
      await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }
    await app?.close();
  });

  describe('Parcours nominal coach↔athlète (auth → séance → perf → revue → dérivations)', () => {
    it('déroule le cycle complet de bout en bout', async () => {
      // 1) Comptes coach + athlète, consentements athlète (saisie perf + lecture coach).
      const coach = await register('coach');
      const athlete = await register('athlete');
      await grantConsent(athlete.token, 'data_processing');
      await grantConsent(athlete.token, 'coach_access');

      // 2) Le coach crée un groupe → l'athlète le rejoint via le code (crée le lien actif).
      const group = await http()
        .post('/api/v1/groups')
        .set(bearer(coach.token))
        .send({ name: 'Sprint élite' })
        .expect(201);
      const inviteCode: string = group.body.inviteCode;
      expect(inviteCode).toEqual(expect.any(String));

      await http()
        .post('/api/v1/groups/join')
        .set(bearer(athlete.token))
        .send({ inviteCode })
        .expect(200);

      // Le lien coach↔athlète est désormais actif.
      const link = await prisma.coachAthleteLink.findFirst({
        where: { coachId: coach.id, athleteId: athlete.id, endedAt: null },
      });
      expect(link).not.toBeNull();

      // 3) Le coach crée une séance à blocs typés (sprint + grille de barres, ADR-25).
      const session = await http()
        .post('/api/v1/sessions')
        .set(bearer(coach.token))
        .send({
          title: 'Vitesse + Hauteur',
          status: 'published',
          exercises: {
            schemaVersion: 2,
            items: [
              { name: '60m', order: 0, type: 'sprint', params: { distanceMeters: 60, reps: 2 } },
              {
                name: 'Hauteur',
                order: 1,
                type: 'vertical_jumps',
                params: { discipline: 'high', startHeightCm: 165, incrementCm: 5 },
              },
            ],
          },
        })
        .expect(201);
      const sessionId: string = session.body.id;

      // 4) Affectation à l'athlète (écriture idempotente : en-tête Idempotency-Key requis).
      const assign = await http()
        .post(`/api/v1/sessions/${sessionId}/assign`)
        .set(bearer(coach.token))
        .set('Idempotency-Key', `assign-${sessionId}`)
        .send({ athleteIds: [athlete.id] })
        .expect(201);
      const assignmentId: string = assign.body.data[0].id;
      expect(assignmentId).toEqual(expect.any(String));

      // 5) L'athlète voit son affectation, puis soumet sa performance (mesures v2).
      const list = await http().get('/api/v1/assignments').set(bearer(athlete.token)).expect(200);
      expect(list.body.data.some((a: { id: string }) => a.id === assignmentId)).toBe(true);

      const perf = await http()
        .post(`/api/v1/assignments/${assignmentId}/performance`)
        .set(bearer(athlete.token))
        .set('Idempotency-Key', `perf-${assignmentId}`)
        .send({
          rpe: 7,
          results: {
            schemaVersion: 2,
            items: [
              {
                exerciseName: '60m',
                order: 0,
                setResults: [
                  { set: 1, timeSeconds: 7.45, completed: true },
                  { set: 2, timeSeconds: 7.6, completed: true },
                ],
              },
              {
                exerciseName: 'Hauteur',
                order: 1,
                // Grille de barres : 1.75 et 1.80 franchies, 1.85 manquée → barre franchie 1.80.
                setResults: [
                  { set: 1, distanceMeters: 1.75, completed: true },
                  { set: 2, distanceMeters: 1.8, completed: true },
                  { set: 3, distanceMeters: 1.85, failed: true, completed: true },
                ],
              },
            ],
          },
        })
        .expect(201);
      const performanceId: string = perf.body.id;

      // La détection de records (ADR-20) propose le sprint (min) et la hauteur (max), sans collision.
      const candidateKeys = (perf.body.recordCandidates ?? []).map(
        (c: { eventKey: string }) => c.eventKey,
      );
      expect(candidateKeys).toEqual(expect.arrayContaining(['sprint:60m', 'vertical:high']));
      const high = perf.body.recordCandidates.find(
        (c: { eventKey: string }) => c.eventKey === 'vertical:high',
      );
      expect(high.value).toBe(1.8); // barre franchie = max non-mordue

      // La soumission bascule l'affectation en `completed`.
      const assignment = await prisma.sessionAssignment.findUnique({ where: { id: assignmentId } });
      expect(assignment!.status).toBe('completed');

      // 6) Côté coach, l'athlète passe « à revoir » (perf sans commentaire coach).
      const dash1 = await http()
        .get('/api/v1/coach/dashboard')
        .set(bearer(coach.token))
        .expect(200);
      const row1 = dash1.body.athletes.find((a: { id: string }) => a.id === athlete.id);
      expect(row1.toReviewCount).toBeGreaterThanOrEqual(1);
      expect(dash1.body.summary.toReview).toBeGreaterThanOrEqual(1);

      // 7) Le coach poste un feedback → la perf sort de « à revoir ».
      await http()
        .post('/api/v1/comments')
        .set(bearer(coach.token))
        .send({ performanceId, body: 'Belle séance, on garde le rythme.' })
        .expect(201);

      const dash2 = await http()
        .get('/api/v1/coach/dashboard')
        .set(bearer(coach.token))
        .expect(200);
      const row2 = dash2.body.athletes.find((a: { id: string }) => a.id === athlete.id);
      expect(row2.toReviewCount).toBe(0);

      // 8) L'athlète confirme son record de hauteur → matérialisé et relisible.
      await http()
        .put(`/api/v1/athletes/me/records/${encodeURIComponent('vertical:high')}`)
        .set(bearer(athlete.token))
        .send({ performanceId })
        .expect(200);

      const myRecords = await http()
        .get('/api/v1/athletes/me/records')
        .set(bearer(athlete.token))
        .expect(200);
      const highRecord = myRecords.body.items.find(
        (r: { eventKey: string }) => r.eventKey === 'vertical:high',
      );
      expect(highRecord).toBeDefined();
      expect(Number(highRecord.value)).toBe(1.8);

      // 9) Progression athlète : métriques dérivées + une série par épreuve.
      const progress = await http()
        .get('/api/v1/athletes/me/progress')
        .set(bearer(athlete.token))
        .expect(200);
      expect(progress.body.metrics.completed).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(progress.body.series)).toBe(true);

      // 10) Stats côté coach (consent-gated coach_access) : peuplées.
      const stats = await http()
        .get(`/api/v1/athletes/${athlete.id}/stats`)
        .set(bearer(coach.token))
        .expect(200);
      expect(stats.body.metrics.completed).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Idempotence des écritures sensibles', () => {
    it('ré-affecter le même athlète (même clé) ne crée pas de doublon', async () => {
      const coach = await register('coach');
      const athlete = await register('athlete');
      await grantConsent(athlete.token, 'data_processing');
      const group = await http()
        .post('/api/v1/groups')
        .set(bearer(coach.token))
        .send({ name: 'G' })
        .expect(201);
      await http()
        .post('/api/v1/groups/join')
        .set(bearer(athlete.token))
        .send({ inviteCode: group.body.inviteCode })
        .expect(200);
      const session = await http()
        .post('/api/v1/sessions')
        .set(bearer(coach.token))
        .send({ title: 'S', exercises: { items: [{ name: 'A', order: 0 }] } })
        .expect(201);

      const key = `assign-${session.body.id}`;
      const first = await http()
        .post(`/api/v1/sessions/${session.body.id}/assign`)
        .set(bearer(coach.token))
        .set('Idempotency-Key', key)
        .send({ athleteIds: [athlete.id] })
        .expect(201);
      const second = await http()
        .post(`/api/v1/sessions/${session.body.id}/assign`)
        .set(bearer(coach.token))
        .set('Idempotency-Key', key)
        .send({ athleteIds: [athlete.id] })
        .expect(201);

      const firstId = first.body.data[0].id;
      const secondId = second.body.data[0].id;
      expect(secondId).toBe(firstId);

      // Une seule affectation active (idempotence structurelle, index partiel unique).
      const count = await prisma.sessionAssignment.count({
        where: { sessionId: session.body.id, athleteId: athlete.id, status: { not: 'cancelled' } },
      });
      expect(count).toBe(1);
    });
  });

  describe('Autorisation : RBAC + ownership + consentement', () => {
    it('interdit à un athlète de créer une séance (RBAC) → 403', async () => {
      const athlete = await register('athlete');
      await http()
        .post('/api/v1/sessions')
        .set(bearer(athlete.token))
        .send({ title: 'X', exercises: { items: [{ name: 'A', order: 0 }] } })
        .expect(403);
    });

    it('refuse la saisie de perf sans consentement data_processing → 403 CONSENT_REQUIRED', async () => {
      const coach = await register('coach');
      const athlete = await register('athlete'); // pas de consentement accordé
      const group = await http()
        .post('/api/v1/groups')
        .set(bearer(coach.token))
        .send({ name: 'G' })
        .expect(201);
      await http()
        .post('/api/v1/groups/join')
        .set(bearer(athlete.token))
        .send({ inviteCode: group.body.inviteCode })
        .expect(200);
      const session = await http()
        .post('/api/v1/sessions')
        .set(bearer(coach.token))
        .send({ title: 'S', exercises: { items: [{ name: 'A', order: 0 }] } })
        .expect(201);
      const assign = await http()
        .post(`/api/v1/sessions/${session.body.id}/assign`)
        .set(bearer(coach.token))
        .set('Idempotency-Key', `assign-${session.body.id}`)
        .send({ athleteIds: [athlete.id] })
        .expect(201);
      const assignmentId = assign.body.data[0].id;

      const res = await http()
        .post(`/api/v1/assignments/${assignmentId}/performance`)
        .set(bearer(athlete.token))
        .set('Idempotency-Key', `perf-${assignmentId}`)
        .send({ results: { items: [{ exerciseName: 'A', order: 0, setResults: [] }] } });
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('CONSENT_REQUIRED');
    });

    it("empêche un coach d'accéder à la séance d'un autre coach (ownership) → 403", async () => {
      const owner = await register('coach');
      const intruder = await register('coach');
      const session = await http()
        .post('/api/v1/sessions')
        .set(bearer(owner.token))
        .send({ title: 'Privée', exercises: { items: [{ name: 'A', order: 0 }] } })
        .expect(201);

      // Convention OwnershipService : 404 si absente, 403 si elle existe mais autre coach.
      await http()
        .get(`/api/v1/sessions/${session.body.id}`)
        .set(bearer(intruder.token))
        .expect(403);
      await http().get(`/api/v1/sessions/${randomUUID()}`).set(bearer(intruder.token)).expect(404);
    });

    it('bloque la lecture des stats sans coach_access → 403 CONSENT_REQUIRED', async () => {
      const coach = await register('coach');
      const athlete = await register('athlete');
      await grantConsent(athlete.token, 'data_processing'); // mais PAS coach_access
      const group = await http()
        .post('/api/v1/groups')
        .set(bearer(coach.token))
        .send({ name: 'G' })
        .expect(201);
      await http()
        .post('/api/v1/groups/join')
        .set(bearer(athlete.token))
        .send({ inviteCode: group.body.inviteCode })
        .expect(200);

      const res = await http().get(`/api/v1/athletes/${athlete.id}/stats`).set(bearer(coach.token));
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('CONSENT_REQUIRED');
    });

    it('rejette toute route protégée sans jeton → 401', async () => {
      await http().get('/api/v1/coach/dashboard').expect(401);
    });
  });
});
