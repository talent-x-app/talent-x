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
      await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
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

      // L'athlète lit son rattachement (ADR-26 — GET /groups/mine) : groupe + coach, sans code.
      const mine = await http().get('/api/v1/groups/mine').set(bearer(athlete.token)).expect(200);
      expect(mine.body.data).toHaveLength(1);
      expect(mine.body.data[0]).toMatchObject({
        id: group.body.id,
        name: 'Sprint élite',
        coach: { id: coach.id },
      });
      expect(mine.body.data[0]).not.toHaveProperty('inviteCode');
      // Le coach n'a pas accès à cette route athlète (RBAC).
      await http().get('/api/v1/groups/mine').set(bearer(coach.token)).expect(403);

      // Régénération du code d'invitation (ADR-16) : **200** conforme au contrat (et non le 201
      // par défaut d'un POST Nest) — sans @HttpCode(200) le client traite la réponse en erreur et
      // l'écran coach ne rafraîchit pas le code (bug attrapé en vérif live TLX-87).
      const regen = await http()
        .post(`/api/v1/groups/${group.body.id}/invite-code`)
        .set(bearer(coach.token))
        .send({ action: 'regenerate' })
        .expect(200);
      expect(regen.body.inviteCode).toEqual(expect.any(String));
      expect(regen.body.inviteCode).not.toBe(inviteCode);

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

      // Saison & marques par année (ADR-34) dérivées sur la série sprint:60m : le SB de
      // l'année en cours et une entrée par année sont exposés sur ProgressSeries.
      const sprintSeries = progress.body.series.find(
        (s: { eventKey: string }) => s.eventKey === 'sprint:60m',
      );
      expect(sprintSeries).toBeDefined();
      const currentYear = new Date().getUTCFullYear();
      expect(sprintSeries.seasonBest).toMatchObject({ value: 7.45 });
      expect(sprintSeries.seasonBest.date.slice(0, 4)).toBe(String(currentYear));
      expect(sprintSeries.marksByYear).toEqual(
        expect.arrayContaining([{ year: currentYear, best: 7.45, count: 1 }]),
      );

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

  describe('Groupes d’exercices v3 (ADR-27)', () => {
    it('round-trip d’une séance à groupe : persistée intacte + records dérivés des feuilles', async () => {
      const coach = await register('coach');
      const athlete = await register('athlete');
      await grantConsent(athlete.token, 'data_processing');

      // Lien via groupe (rend l'athlète affectable).
      const group = await http()
        .post('/api/v1/groups')
        .set(bearer(coach.token))
        .send({ name: 'Gv3' })
        .expect(201);
      await http()
        .post('/api/v1/groups/join')
        .set(bearer(athlete.token))
        .send({ inviteCode: group.body.inviteCode })
        .expect(200);

      // Séance v3 : un échauffement simple + un GROUPE « série » (3 tours) contenant un sprint.
      const session = await http()
        .post('/api/v1/sessions')
        .set(bearer(coach.token))
        .send({
          title: 'Séries de vitesse',
          status: 'published',
          exercises: {
            schemaVersion: 3,
            items: [
              { name: 'Échauffement', order: 0, type: 'warmup', durationSeconds: 600 },
              {
                kind: 'group',
                name: 'Série de vitesse',
                order: 1,
                groupType: 'series',
                rounds: 3,
                restBetweenRoundsSeconds: 480,
                items: [
                  {
                    name: 'Ligne droite',
                    order: 2,
                    type: 'sprint',
                    params: { distanceMeters: 60 },
                  },
                ],
              },
            ],
          },
        })
        .expect(201);
      const sessionId: string = session.body.id;

      // Lecture : le groupe est rendu INTACT (pas d'aplatissement serveur), v3 préservé.
      const read = await http()
        .get(`/api/v1/sessions/${sessionId}`)
        .set(bearer(coach.token))
        .expect(200);
      expect(read.body.exercises.schemaVersion).toBe(3);
      const groupNode = read.body.exercises.items[1];
      expect(groupNode).toMatchObject({
        kind: 'group',
        groupType: 'series',
        rounds: 3,
        restBetweenRoundsSeconds: 480,
      });
      expect(groupNode.items).toHaveLength(1);
      expect(groupNode.items[0]).toMatchObject({ name: 'Ligne droite', type: 'sprint' });
      // L'exercice simple de premier niveau garde son type (rétro-compat mapper).
      expect(read.body.exercises.items[0]).toMatchObject({ name: 'Échauffement', type: 'warmup' });

      // Affectation + perf : le résultat se joint à la FEUILLE du groupe par l'order.
      const assign = await http()
        .post(`/api/v1/sessions/${sessionId}/assign`)
        .set(bearer(coach.token))
        .set('Idempotency-Key', `assign-${sessionId}`)
        .send({ athleteIds: [athlete.id] })
        .expect(201);
      const assignmentId: string = assign.body.data[0].id;

      const perf = await http()
        .post(`/api/v1/assignments/${assignmentId}/performance`)
        .set(bearer(athlete.token))
        .set('Idempotency-Key', `perf-${assignmentId}`)
        .send({
          rpe: 6,
          results: {
            schemaVersion: 2,
            items: [
              {
                exerciseName: 'Ligne droite',
                order: 2,
                setResults: [{ set: 1, timeSeconds: 7.3, completed: true }],
              },
            ],
          },
        })
        .expect(201);

      // La détection de records aplatit les feuilles du groupe puis dérive l'épreuve.
      const candidates = (perf.body.recordCandidates ?? []) as {
        eventKey: string;
        value: number;
      }[];
      const sprint = candidates.find((c) => c.eventKey === 'sprint:60m');
      expect(sprint).toBeDefined();
      expect(sprint!.value).toBe(7.3);
    });
  });

  describe('Modèles de séance — bibliothèque C-10 (ADR-29)', () => {
    it('crée un modèle, le liste, refuse de l’affecter (422) et le duplique en séance assignable', async () => {
      const coach = await register('coach');

      // 1) Le coach crée un **modèle** (statut `template`) — non daté, réutilisable.
      const template = await http()
        .post('/api/v1/sessions')
        .set(bearer(coach.token))
        .send({
          title: 'Modèle — VMA 6×400m',
          status: 'template',
          exercises: {
            schemaVersion: 3,
            items: [
              {
                name: '6 × 400m',
                order: 1,
                type: 'interval',
                params: { reps: 6, distanceMeters: 400 },
              },
            ],
          },
        })
        .expect(201);
      expect(template.body.status).toBe('template');
      const templateId: string = template.body.id;

      // 2) La bibliothèque = `GET /sessions?status=template` (filtre existant).
      const library = await http()
        .get('/api/v1/sessions?status=template')
        .set(bearer(coach.token))
        .expect(200);
      expect(library.body.data.some((s: { id: string }) => s.id === templateId)).toBe(true);
      expect(library.body.data.every((s: { status: string }) => s.status === 'template')).toBe(
        true,
      );

      // 3) Un modèle n'est **pas assignable** → 422 `SESSION_NOT_ASSIGNABLE` (garde ADR-29),
      //    avant même toute vérification de lien athlète.
      const assignTemplate = await http()
        .post(`/api/v1/sessions/${templateId}/assign`)
        .set(bearer(coach.token))
        .set('Idempotency-Key', `tpl-${templateId}`)
        .send({ athleteIds: [randomUUID()] })
        .expect(422);
      expect(assignTemplate.body.error).toBe('SESSION_NOT_ASSIGNABLE');

      // 4) « Utiliser ce modèle » = duplication → nouvelle séance en **brouillon** (assignable).
      const copy = await http()
        .post(`/api/v1/sessions/${templateId}/duplicate`)
        .set(bearer(coach.token))
        .expect(201);
      expect(copy.body.status).toBe('draft');
      expect(copy.body.id).not.toBe(templateId);

      // La copie (draft) franchit le garde de modèle : elle échoue plus loin, sur le lien athlète
      // inexistant (403) — preuve que le garde 422 est spécifique au statut `template`.
      await http()
        .post(`/api/v1/sessions/${copy.body.id}/assign`)
        .set(bearer(coach.token))
        .set('Idempotency-Key', `copy-${copy.body.id}`)
        .send({ athleteIds: [randomUUID()] })
        .expect(403);
    });
  });

  describe('Cycle de vie des affectations — ADR-31 (TLX-108)', () => {
    /** Coach + athlète liés + une affectation échue (assigned, dueDate passée). */
    async function setup() {
      const coach = await register('coach');
      const athlete = await register('athlete');
      await grantConsent(athlete.token, 'coach_access');
      await prisma.coachAthleteLink.create({
        data: { coachId: coach.id, athleteId: athlete.id, source: 'direct' },
      });
      const session = await prisma.session.create({
        data: { coachId: coach.id, title: 'Sprint', status: 'published' },
      });
      const assignment = await prisma.sessionAssignment.create({
        data: { sessionId: session.id, athleteId: athlete.id, dueDate: new Date('2026-01-05') },
      });
      return { coach, athlete, assignment };
    }

    it('replan (coach), skip athlète sort du retard, assiduité exclut skipped, transitions gardées', async () => {
      const { coach, athlete, assignment } = await setup();

      // Échue → comptée en retard au dashboard coach.
      const before = await http()
        .get('/api/v1/coach/dashboard')
        .set(bearer(coach.token))
        .expect(200);
      expect(before.body.summary.alerts.missedSessions).toBe(1);

      // Coach replanifie (dueDate). Athlète ne peut pas → 403.
      await http()
        .patch(`/api/v1/assignments/${assignment.id}`)
        .set(bearer(athlete.token))
        .send({ dueDate: '2026-09-01' })
        .expect(403);
      const replan = await http()
        .patch(`/api/v1/assignments/${assignment.id}`)
        .set(bearer(coach.token))
        .send({ dueDate: '2026-01-06' })
        .expect(200);
      expect(replan.body.dueDate).toBe('2026-01-06');

      // Athlète signale une indispo (skipped + motif).
      const skipped = await http()
        .patch(`/api/v1/assignments/${assignment.id}`)
        .set(bearer(athlete.token))
        .send({ status: 'skipped', skipReason: 'injury' })
        .expect(200);
      expect(skipped.body.status).toBe('skipped');
      expect(skipped.body.skipReason).toBe('injury');

      // Le retard est soldé : disparaît des alertes du dashboard.
      const after = await http()
        .get('/api/v1/coach/dashboard')
        .set(bearer(coach.token))
        .expect(200);
      expect(after.body.summary.alerts.missedSessions).toBe(0);

      // Stats d'assiduité : skipped compté, exclu du dénominateur (1 total − 1 skip → rate 0).
      const stats = await http()
        .get(`/api/v1/athletes/${athlete.id}/stats`)
        .set(bearer(coach.token))
        .expect(200);
      expect(stats.body.metrics).toMatchObject({ skipped: 1, missed: 0, completionRate: 0 });

      // Transition illégale skipped → in_progress → 422.
      await http()
        .patch(`/api/v1/assignments/${assignment.id}`)
        .set(bearer(athlete.token))
        .send({ status: 'in_progress' })
        .expect(422);

      // Désassignation : athlète interdit (403), coach OK (204), puis introuvable (404).
      await http()
        .delete(`/api/v1/assignments/${assignment.id}`)
        .set(bearer(athlete.token))
        .expect(403);
      await http()
        .delete(`/api/v1/assignments/${assignment.id}`)
        .set(bearer(coach.token))
        .expect(204);
      await http().get(`/api/v1/assignments/${assignment.id}`).set(bearer(coach.token)).expect(404);
    });

    it('désassignation interdite sur une affectation réalisée → 422 ASSIGNMENT_COMPLETED', async () => {
      const { coach, athlete, assignment } = await setup();
      await grantConsent(athlete.token, 'data_processing');
      // L'athlète soumet une perf → l'affectation passe completed.
      await http()
        .post(`/api/v1/assignments/${assignment.id}/performance`)
        .set(bearer(athlete.token))
        .set('Idempotency-Key', `perf-${assignment.id}`)
        .send({ rpe: 6, results: { schemaVersion: 1, items: [] } })
        .expect(201);

      const del = await http()
        .delete(`/api/v1/assignments/${assignment.id}`)
        .set(bearer(coach.token))
        .expect(422);
      expect(del.body.error).toBe('ASSIGNMENT_COMPLETED');
    });
  });

  describe('Charge d’entraînement — sRPE / ACWR (TLX-113)', () => {
    /** Crée une séance (durée planifiée 60 min) + affectation réalisée + perf datée (RPE). */
    async function loadedPerf(coachId: string, athleteId: string, rpe: number, submittedAt: Date) {
      const session = await prisma.session.create({
        data: {
          coachId,
          title: 'Charge',
          status: 'published',
          brief: { schemaVersion: 1, durationMinutes: 60 },
        },
      });
      const assignment = await prisma.sessionAssignment.create({
        data: { sessionId: session.id, athleteId, status: 'completed' },
      });
      await prisma.performance.create({
        data: { assignmentId: assignment.id, athleteId, rpe, submittedAt },
      });
    }

    it('dérive la charge sur le dashboard, consent-gated coach_access', async () => {
      const coach = await register('coach');
      const athlete = await register('athlete');
      await grantConsent(athlete.token, 'coach_access');
      await prisma.coachAthleteLink.create({
        data: { coachId: coach.id, athleteId: athlete.id, source: 'direct' },
      });

      // Une séance réalisée aujourd'hui : sRPE = 8 × 60 = 480 → charge aiguë 480.
      await loadedPerf(coach.id, athlete.id, 8, new Date());

      const withConsent = await http()
        .get('/api/v1/coach/dashboard')
        .set(bearer(coach.token))
        .expect(200);
      const row = withConsent.body.athletes.find((a: { id: string }) => a.id === athlete.id);
      expect(row.load).toMatchObject({ acute: 480, sessions: 1 });
      expect(['insufficient', 'underload', 'optimal', 'overload']).toContain(row.load.zone);

      // Retrait du consentement coach_access → la charge disparaît (RGPD).
      await grantConsent(athlete.token, 'coach_access', false);
      const withoutConsent = await http()
        .get('/api/v1/coach/dashboard')
        .set(bearer(coach.token))
        .expect(200);
      const gated = withoutConsent.body.athletes.find((a: { id: string }) => a.id === athlete.id);
      expect(gated.load).toBeUndefined();
      expect(gated.coachAccessGranted).toBe(false);
    });
  });

  describe('Progression côté coach — GET /athletes/:id/progress (TLX-112)', () => {
    it('miroir consent-gated : 200 avec coach_access, 403 sans, 403 sans lien', async () => {
      const coach = await register('coach');
      const stranger = await register('coach');
      const athlete = await register('athlete');
      await prisma.coachAthleteLink.create({
        data: { coachId: coach.id, athleteId: athlete.id, source: 'direct' },
      });

      // Sans coach_access → 403 CONSENT_REQUIRED.
      const noConsent = await http()
        .get(`/api/v1/athletes/${athlete.id}/progress`)
        .set(bearer(coach.token))
        .expect(403);
      expect(noConsent.body.error).toBe('CONSENT_REQUIRED');

      // Avec coach_access → 200, même forme que /me/progress (metrics + series).
      await grantConsent(athlete.token, 'coach_access');
      const ok = await http()
        .get(`/api/v1/athletes/${athlete.id}/progress`)
        .set(bearer(coach.token))
        .expect(200);
      expect(ok.body.athleteId).toBe(athlete.id);
      expect(ok.body.metrics).toBeDefined();
      expect(Array.isArray(ok.body.series)).toBe(true);

      // Coach non lié → 403 (ownership), même si l'athlète a consenti.
      await http()
        .get(`/api/v1/athletes/${athlete.id}/progress`)
        .set(bearer(stranger.token))
        .expect(403);
    });
  });

  describe('Historisation des corrections de perf — RB-06 (TLX-110 / ADR-33)', () => {
    it('trace chaque correction dans audit_log (before/after) ; un PUT identique ne trace rien', async () => {
      const coach = await register('coach');
      const athlete = await register('athlete');
      await grantConsent(athlete.token, 'data_processing');
      await prisma.coachAthleteLink.create({
        data: { coachId: coach.id, athleteId: athlete.id, source: 'direct' },
      });
      const session = await prisma.session.create({
        data: {
          coachId: coach.id,
          title: 'Correction',
          status: 'published',
          exercises: { schemaVersion: 1, items: [{ name: '60m', order: 0 }] },
        },
      });
      const assignment = await prisma.sessionAssignment.create({
        data: { sessionId: session.id, athleteId: athlete.id },
      });

      // Soumission initiale (RPE 7) — ne crée aucune trace de correction (pas d'historique antérieur).
      const perf = await http()
        .post(`/api/v1/assignments/${assignment.id}/performance`)
        .set(bearer(athlete.token))
        .set('Idempotency-Key', `perf-${assignment.id}`)
        .send({
          rpe: 7,
          results: {
            schemaVersion: 1,
            items: [{ exerciseName: '60m', order: 0, setResults: [{ set: 1, timeSeconds: 7.45 }] }],
          },
        })
        .expect(201);
      const performanceId: string = perf.body.id;

      // Correction réelle : RPE 7 → 6, marque 7.45 → 7.60.
      await http()
        .put(`/api/v1/assignments/${assignment.id}/performance`)
        .set(bearer(athlete.token))
        .send({
          rpe: 6,
          results: {
            schemaVersion: 1,
            items: [{ exerciseName: '60m', order: 0, setResults: [{ set: 1, timeSeconds: 7.6 }] }],
          },
        })
        .expect(200);

      // Une trace performance.correction est persistée, avec before/after.
      const traces = await prisma.auditLog.findMany({
        where: { action: 'performance.correction', entityId: performanceId },
      });
      expect(traces).toHaveLength(1);
      expect(traces[0].actorId).toBe(athlete.id);
      expect(traces[0].entityType).toBe('performance');
      const meta = traces[0].metadata as {
        before: { rpe: number };
        after: { rpe: number };
      };
      expect(meta.before.rpe).toBe(7);
      expect(meta.after.rpe).toBe(6);

      // Un PUT identique (mêmes valeurs) ne laisse pas de trace vide.
      await http()
        .put(`/api/v1/assignments/${assignment.id}/performance`)
        .set(bearer(athlete.token))
        .send({
          rpe: 6,
          results: {
            schemaVersion: 1,
            items: [{ exerciseName: '60m', order: 0, setResults: [{ set: 1, timeSeconds: 7.6 }] }],
          },
        })
        .expect(200);

      const after = await prisma.auditLog.count({
        where: { action: 'performance.correction', entityId: performanceId },
      });
      expect(after).toBe(1);
    });
  });

  describe('Records manuels — POST /athletes/me/records (TLX-116 / ADR-32)', () => {
    it('déclare, remplace, valide l’épreuve et la porte data_processing', async () => {
      const athlete = await register('athlete');

      // Sans consentement → 403.
      await http()
        .post('/api/v1/athletes/me/records')
        .set(bearer(athlete.token))
        .send({ family: 'sprint', distanceMeters: 60, value: 7.45 })
        .expect(403);

      await grantConsent(athlete.token, 'data_processing');

      // Déclaration : clé composée serveur, marque libre, badge manuel (performanceId absent).
      const created = await http()
        .post('/api/v1/athletes/me/records')
        .set(bearer(athlete.token))
        .send({ family: 'sprint', distanceMeters: 60, value: 7.45 })
        .expect(200);
      expect(created.body).toMatchObject({ eventKey: 'sprint:60m', value: 7.45, unit: 's' });
      expect(created.body.performanceId).toBeUndefined();

      // Correction (remplace, même clé, pas de garde « doit améliorer » — ici on dégrade).
      const corrected = await http()
        .post('/api/v1/athletes/me/records')
        .set(bearer(athlete.token))
        .send({ family: 'sprint', distanceMeters: 60, value: 7.6 })
        .expect(200);
      expect(corrected.body.value).toBe(7.6);

      // Un seul record pour l'épreuve (upsert sur clé unique).
      const list = await http()
        .get('/api/v1/athletes/me/records')
        .set(bearer(athlete.token))
        .expect(200);
      const sixty = list.body.items.filter(
        (r: { eventKey: string }) => r.eventKey === 'sprint:60m',
      );
      expect(sixty).toHaveLength(1);
      expect(sixty[0].value).toBe(7.6);

      // Famille chronométrée sans distance → 422 INVALID_EVENT.
      const bad = await http()
        .post('/api/v1/athletes/me/records')
        .set(bearer(athlete.token))
        .send({ family: 'sprint', value: 7 })
        .expect(422);
      expect(bad.body.error).toBe('INVALID_EVENT');
    });
  });
});
