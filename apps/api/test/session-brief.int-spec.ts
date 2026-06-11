import { randomUUID } from 'node:crypto';
import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { validationExceptionFactory } from '../src/common/validation/validation-exception.factory';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * E2E DB-backed du **brief de séance** (ADR-28, TLX-98) : prouve la **double lecture**
 * sur le vrai stack HTTP + base migrée. Garantie de sécurité centrale : les champs
 * coach-only (`intent`, `coachNotes`) ne transitent JAMAIS vers un lecteur athlète, sur
 * toutes les surfaces qui sérialisent une séance (lecture directe + séance embarquée dans
 * les affectations). Couvre aussi la rétro-compat (séance sans brief) et la persistance.
 *
 * Auto-suffisant : crée ses fixtures (e-mails uniques) et les nettoie en fin de suite.
 * Prérequis : base joignable + migrée (local `docker compose` :5433).
 */
describe('Brief de séance — double lecture (E2E DB) — ADR-28 / TLX-98', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdUserIds: string[] = [];

  const uniqueEmail = (): string => `e2e-brief-${randomUUID()}@ex.test`;
  const PASSWORD = 'Sup3rSecret!';
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const http = () => request(app.getHttpServer());

  /** Brief complet de l'exemple ADR-28 (VO₂max) : champs partagés + coach-only. */
  const BRIEF = {
    athleteIntent: 'Des efforts courts et rapides, réguliers. Ne pars pas trop vite.',
    durationMinutes: 75,
    difficulty: 7,
    successCriteria: 'Tenir les 16 efforts au même rythme.',
    stopCriteria: "Ta foulée s'écrase ou tu ne suis plus l'allure.",
    intent: 'Intermittent court à haute intensité pour solliciter le VO₂max. Régularité > sprint.',
    coachNotes: {
      regression: '2 × 6 rép. si décrochage ; récup 1 min.',
      progression: 'Semaine suivante 2 × 10 rép. ou 40/20.',
      caution: 'Reprise après semaine chargée — surveiller la qualité des appuis.',
    },
  };

  async function register(role: 'coach' | 'athlete') {
    const email = uniqueEmail();
    const res = await http()
      .post('/api/v1/auth/register')
      .send({ email, password: PASSWORD, role, firstName: 'E2E', lastName: role });
    expect(res.status).toBe(201);
    createdUserIds.push(res.body.user.id);
    return { id: res.body.user.id as string, token: res.body.accessToken as string };
  }

  async function grantConsent(token: string, type: 'data_processing' | 'coach_access') {
    await http()
      .put('/api/v1/users/me/consents')
      .set(bearer(token))
      .send({ type, granted: true })
      .expect(200);
  }

  /** Coach + athlète liés (groupe + join) ; renvoie leurs jetons/ids. */
  async function linkedPair() {
    const coach = await register('coach');
    const athlete = await register('athlete');
    await grantConsent(athlete.token, 'data_processing');
    await grantConsent(athlete.token, 'coach_access');
    const group = await http()
      .post('/api/v1/groups')
      .set(bearer(coach.token))
      .send({ name: `G-${randomUUID().slice(0, 8)}` })
      .expect(201);
    await http()
      .post('/api/v1/groups/join')
      .set(bearer(athlete.token))
      .send({ inviteCode: group.body.inviteCode })
      .expect(200);
    return { coach, athlete };
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
    await prisma.$queryRaw`SELECT 1`;
  });

  afterAll(async () => {
    if (prisma && createdUserIds.length > 0) {
      const ids = createdUserIds;
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

  it('le coach reçoit le brief complet ; l’athlète ne reçoit jamais intent ni coachNotes', async () => {
    const { coach, athlete } = await linkedPair();

    // 1) Le coach crée une séance publiée AVEC brief.
    const created = await http()
      .post('/api/v1/sessions')
      .set(bearer(coach.token))
      .send({
        title: 'Intermittent VO₂max',
        status: 'published',
        exercises: { schemaVersion: 2, items: [{ name: '30/30', order: 0, type: 'interval' }] },
        brief: BRIEF,
      })
      .expect(201);
    const sessionId: string = created.body.id;

    // À la création, le créateur (coach) reçoit le brief COMPLET.
    expect(created.body.brief).toMatchObject({
      athleteIntent: BRIEF.athleteIntent,
      difficulty: 7,
      intent: BRIEF.intent,
      coachNotes: { regression: BRIEF.coachNotes.regression },
    });
    expect(created.body.brief.schemaVersion).toBe(1);

    // 2) Lecture coach (GET /sessions/:id) → brief complet.
    const coachRead = await http()
      .get(`/api/v1/sessions/${sessionId}`)
      .set(bearer(coach.token))
      .expect(200);
    expect(coachRead.body.brief.intent).toBe(BRIEF.intent);
    expect(coachRead.body.brief.coachNotes).toBeDefined();

    // 3) Affectation à l'athlète.
    const assign = await http()
      .post(`/api/v1/sessions/${sessionId}/assign`)
      .set(bearer(coach.token))
      .set('Idempotency-Key', `assign-${sessionId}`)
      .send({ athleteIds: [athlete.id] })
      .expect(201);
    const assignmentId: string = assign.body.data[0].id;

    // 4) GARANTIE CENTRALE — séance embarquée dans l'affectation lue par l'athlète :
    //    champs partagés présents, intent + coachNotes ABSENTS.
    const athleteAssignment = await http()
      .get(`/api/v1/assignments/${assignmentId}`)
      .set(bearer(athlete.token))
      .expect(200);
    const embedded = athleteAssignment.body.session.brief;
    expect(embedded).toMatchObject({
      athleteIntent: BRIEF.athleteIntent,
      durationMinutes: 75,
      difficulty: 7,
      successCriteria: BRIEF.successCriteria,
      stopCriteria: BRIEF.stopCriteria,
    });
    expect(embedded).not.toHaveProperty('intent');
    expect(embedded).not.toHaveProperty('coachNotes');

    // 5) Lecture directe athlète (GET /sessions/:id role-aware) → même filtrage.
    const athleteRead = await http()
      .get(`/api/v1/sessions/${sessionId}`)
      .set(bearer(athlete.token))
      .expect(200);
    expect(athleteRead.body.brief).not.toHaveProperty('intent');
    expect(athleteRead.body.brief).not.toHaveProperty('coachNotes');
    expect(athleteRead.body.brief.athleteIntent).toBe(BRIEF.athleteIntent);

    // 6) Liste des affectations de l'athlète → brief embarqué également filtré.
    const list = await http().get('/api/v1/assignments').set(bearer(athlete.token)).expect(200);
    const row = list.body.data.find((a: { id: string }) => a.id === assignmentId);
    expect(row.session.brief).not.toHaveProperty('intent');
    expect(row.session.brief).not.toHaveProperty('coachNotes');

    // 7) Défense en profondeur : aucune fuite des notes internes dans le payload brut athlète.
    const rawAthletePayload = JSON.stringify(athleteAssignment.body);
    expect(rawAthletePayload).not.toContain(BRIEF.coachNotes.regression);
    expect(rawAthletePayload).not.toContain(BRIEF.intent);
  });

  it('séance sans brief : champ absent, lecture athlète OK (rétro-compat)', async () => {
    const { coach, athlete } = await linkedPair();
    const created = await http()
      .post('/api/v1/sessions')
      .set(bearer(coach.token))
      .send({
        title: 'Sans brief',
        status: 'published',
        exercises: { items: [{ name: 'A', order: 0 }] },
      })
      .expect(201);
    expect(created.body.brief).toBeUndefined();

    const assign = await http()
      .post(`/api/v1/sessions/${created.body.id}/assign`)
      .set(bearer(coach.token))
      .set('Idempotency-Key', `assign-${created.body.id}`)
      .send({ athleteIds: [athlete.id] })
      .expect(201);
    const athleteRead = await http()
      .get(`/api/v1/assignments/${assign.body.data[0].id}`)
      .set(bearer(athlete.token))
      .expect(200);
    expect(athleteRead.body.session.brief).toBeUndefined();
  });

  it('rejette un brief hors-bornes (difficulty 11) → 422', async () => {
    const coach = await register('coach');
    await http()
      .post('/api/v1/sessions')
      .set(bearer(coach.token))
      .send({
        title: 'Mauvais brief',
        exercises: { items: [] },
        brief: { difficulty: 11 },
      })
      .expect(422);
  });
});
