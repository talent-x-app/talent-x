import { randomUUID } from 'node:crypto';
import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { validationExceptionFactory } from '../src/common/validation/validation-exception.factory';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Tests d'intégration DB-backed de la **présence (RSVP)** — ADR-43 §1, TLX-173 Phase B.
 * Valident contre une **vraie base** migrée (colonnes `attendance`/`attendance_reason` + CHECK) :
 * le round-trip `PUT /assignments/{id}/attendance`, l'invariant motif, l'**orthogonalité** vis-à-vis
 * du statut d'exécution (ADR-31), la relecture via `GET /assignments`, et la matrice RBAC.
 * Prérequis : base joignable + migrée (local :5433 ; CI service postgres).
 */
describe('Présence (RSVP) — DB intégration (ADR-43 §1, TLX-173)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdUserIds: string[] = [];

  const uniqueEmail = (): string => `att-${randomUUID()}@ex.test`;
  const PASSWORD = 'Sup3rSecret!';
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const http = () => request(app.getHttpServer());

  async function register(role: 'coach' | 'athlete') {
    const res = await http()
      .post('/api/v1/auth/register')
      .send({ email: uniqueEmail(), password: PASSWORD, role, firstName: 'Att', lastName: role });
    expect(res.status).toBe(201);
    createdUserIds.push(res.body.user.id);
    return { id: res.body.user.id as string, token: res.body.accessToken as string };
  }

  /** Coach crée un groupe ; athlète le rejoint (crée le lien coach↔athlète requis pour assigner). */
  async function linkViaGroup(coachToken: string, athleteToken: string) {
    const group = await http()
      .post('/api/v1/groups')
      .set(bearer(coachToken))
      .send({ name: 'Présence' })
      .expect(201);
    await http()
      .post('/api/v1/groups/join')
      .set(bearer(athleteToken))
      .send({ inviteCode: group.body.inviteCode })
      .expect(200);
  }

  /** Coach crée une séance sprint et l'affecte à l'athlète (datée). Renvoie l'id d'affectation. */
  async function assignTo(coachToken: string, athleteId: string): Promise<string> {
    const session = await http()
      .post('/api/v1/sessions')
      .set(bearer(coachToken))
      .send({
        title: 'Test 150 m',
        exercises: {
          schemaVersion: 3,
          items: [{ name: '150m', order: 0, type: 'sprint', params: { distanceMeters: 150 } }],
        },
      })
      .expect(201);
    const res = await http()
      .post(`/api/v1/sessions/${session.body.id}/assign`)
      .set(bearer(coachToken))
      .set('Idempotency-Key', `assign-${session.body.id}`)
      .send({ athleteIds: [athleteId], dueDate: '2026-06-25' })
      .expect(201);
    return res.body.data[0].id as string;
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
      await prisma.groupAssignment.deleteMany({ where: { session: { coachId: { in: ids } } } });
      await prisma.session.deleteMany({ where: { coachId: { in: ids } } });
      await prisma.groupMember.deleteMany({ where: { athleteId: { in: ids } } });
      await prisma.group.deleteMany({ where: { coachId: { in: ids } } });
      await prisma.coachAthleteLink.deleteMany({
        where: { OR: [{ coachId: { in: ids } }, { athleteId: { in: ids } }] },
      });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }
    await app?.close();
  });

  it('round-trip présence + orthogonalité au statut + relecture + RBAC', async () => {
    const coach = await register('coach');
    const athlete = await register('athlete');
    const other = await register('athlete');
    await linkViaGroup(coach.token, athlete.token);
    const assignmentId = await assignTo(coach.token, athlete.id);

    // going → 200, statut INCHANGÉ (orthogonalité ADR-31), pas de motif.
    const going = await http()
      .put(`/api/v1/assignments/${assignmentId}/attendance`)
      .set(bearer(athlete.token))
      .send({ attendance: 'going' })
      .expect(200);
    expect(going.body.attendance).toBe('going');
    expect(going.body.attendanceReason).toBeUndefined();
    expect(going.body.status).toBe('assigned');

    // not_going SANS motif → 422 ATTENDANCE_REASON_REQUIRED.
    const noReason = await http()
      .put(`/api/v1/assignments/${assignmentId}/attendance`)
      .set(bearer(athlete.token))
      .send({ attendance: 'not_going' })
      .expect(422);
    expect(noReason.body.error).toBe('ATTENDANCE_REASON_REQUIRED');

    // not_going + motif → 200, motif conservé, statut toujours inchangé.
    const notGoing = await http()
      .put(`/api/v1/assignments/${assignmentId}/attendance`)
      .set(bearer(athlete.token))
      .send({ attendance: 'not_going', reason: 'injury' })
      .expect(200);
    expect(notGoing.body.attendance).toBe('not_going');
    expect(notGoing.body.attendanceReason).toBe('injury');
    expect(notGoing.body.status).toBe('assigned');

    // maybe → motif effacé.
    const maybe = await http()
      .put(`/api/v1/assignments/${assignmentId}/attendance`)
      .set(bearer(athlete.token))
      .send({ attendance: 'maybe', reason: 'weather' })
      .expect(200);
    expect(maybe.body.attendance).toBe('maybe');
    expect(maybe.body.attendanceReason).toBeUndefined();

    // Relecture via GET /assignments (athlète) : la présence est persistée.
    const list = await http().get('/api/v1/assignments').set(bearer(athlete.token)).expect(200);
    const row = list.body.data.find((a: { id: string }) => a.id === assignmentId);
    expect(row.attendance).toBe('maybe');

    // RBAC : un autre athlète (non-titulaire) → 403 ; le coach → 403.
    await http()
      .put(`/api/v1/assignments/${assignmentId}/attendance`)
      .set(bearer(other.token))
      .send({ attendance: 'going' })
      .expect(403);
    await http()
      .put(`/api/v1/assignments/${assignmentId}/attendance`)
      .set(bearer(coach.token))
      .send({ attendance: 'going' })
      .expect(403);
  });
});
