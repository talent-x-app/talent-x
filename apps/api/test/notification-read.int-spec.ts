import { randomUUID } from 'node:crypto';
import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { validationExceptionFactory } from '../src/common/validation/validation-exception.factory';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Tests d'intégration DB-backed de la **lecture unitaire des notifications** (TLX-189,
 * ADR-23 additif) : round-trip `PUT /notifications/{id}/read` contre une vraie base —
 * `readAt` posé puis **stable** au 2ᵉ appel (idempotence), 404 anti-énumération
 * (notification d'un autre compte / inexistante), et relecture via `GET /notifications`
 * (`unreadCount` décrémenté, `readAt` exposé). Résolution d'acteur ADR-55 incluse.
 */
describe('Notifications — lecture unitaire, DB intégration (TLX-189)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdUserIds: string[] = [];

  const uniqueEmail = (): string => `notif-${randomUUID()}@ex.test`;
  const PASSWORD = 'Sup3rSecret!';
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const http = () => request(app.getHttpServer());

  async function register(role: 'coach' | 'athlete', firstName: string) {
    const res = await http()
      .post('/api/v1/auth/register')
      .send({ email: uniqueEmail(), password: PASSWORD, role, firstName, lastName: 'Notif' });
    expect(res.status).toBe(201);
    createdUserIds.push(res.body.user.id);
    return { id: res.body.user.id as string, token: res.body.accessToken as string };
  }

  /** Seed direct en base (le fan-out réel passe par la file BullMQ, hors périmètre ici). */
  function seedNotification(userId: string, actorId?: string) {
    return prisma.notification.create({
      data: {
        userId,
        type: 'performance_feedback',
        resourceId: randomUUID(),
        actorId,
        dedupeKey: `int-${randomUUID()}`,
      },
    });
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
      await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }
    await app?.close();
  });

  it('round-trip lecture unitaire : idempotence, ownership 404, unreadCount', async () => {
    const athlete = await register('athlete', 'Aya');
    const other = await register('athlete', 'Zoé');
    const coach = await register('coach', 'Karim');

    const n1 = await seedNotification(athlete.id, coach.id);
    const n2 = await seedNotification(athlete.id);
    const foreign = await seedNotification(other.id);

    // État initial : 2 non-lues, aucune ne porte readAt.
    const before = await http().get('/api/v1/notifications').set(bearer(athlete.token)).expect(200);
    expect(before.body.unreadCount).toBe(2);
    expect(before.body.data.every((n: { readAt?: string }) => n.readAt === undefined)).toBe(true);

    // Lecture unitaire → 200, readAt posé, acteur résolu en prénom (ADR-55).
    const read1 = await http()
      .put(`/api/v1/notifications/${n1.id}/read`)
      .set(bearer(athlete.token))
      .expect(200);
    expect(read1.body.id).toBe(n1.id);
    expect(read1.body.readAt).toEqual(expect.any(String));
    expect(read1.body.actor).toEqual({ id: coach.id, displayName: 'Karim' });

    // Idempotence : 2ᵉ appel → 200 et readAt d'origine conservé à l'identique.
    const read2 = await http()
      .put(`/api/v1/notifications/${n1.id}/read`)
      .set(bearer(athlete.token))
      .expect(200);
    expect(read2.body.readAt).toBe(read1.body.readAt);
    const inDb = await prisma.notification.findUnique({ where: { id: n1.id } });
    expect(inDb?.readAt?.toISOString()).toBe(read1.body.readAt);

    // Anti-énumération : notification d'un autre compte ou inexistante → 404 (indistinguables).
    await http()
      .put(`/api/v1/notifications/${foreign.id}/read`)
      .set(bearer(athlete.token))
      .expect(404);
    await http()
      .put(`/api/v1/notifications/${randomUUID()}/read`)
      .set(bearer(athlete.token))
      .expect(404);
    // La notification étrangère n'a pas été touchée.
    const foreignInDb = await prisma.notification.findUnique({ where: { id: foreign.id } });
    expect(foreignInDb?.readAt).toBeNull();

    // Relecture du feed : unreadCount décrémenté (2 → 1), readAt exposé sur la lue seule.
    const after = await http().get('/api/v1/notifications').set(bearer(athlete.token)).expect(200);
    expect(after.body.unreadCount).toBe(1);
    const byId = new Map(
      after.body.data.map((n: { id: string; readAt?: string }) => [n.id, n.readAt]),
    );
    expect(byId.get(n1.id)).toBe(read1.body.readAt);
    expect(byId.get(n2.id)).toBeUndefined();

    // « Tout marquer lu » : la restante passe lue, badge à zéro — la lue garde son readAt.
    const readAll = await http()
      .post('/api/v1/notifications/read-all')
      .set(bearer(athlete.token))
      .expect(200);
    expect(readAll.body.updated).toBe(1);
    const final = await http().get('/api/v1/notifications').set(bearer(athlete.token)).expect(200);
    expect(final.body.unreadCount).toBe(0);
    const finalById = new Map(
      final.body.data.map((n: { id: string; readAt?: string }) => [n.id, n.readAt]),
    );
    expect(finalById.get(n1.id)).toBe(read1.body.readAt);
    expect(finalById.get(n2.id)).toEqual(expect.any(String));
  });
});
