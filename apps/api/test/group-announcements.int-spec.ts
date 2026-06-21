import { randomUUID } from 'node:crypto';
import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { validationExceptionFactory } from '../src/common/validation/validation-exception.factory';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Tests d'intégration DB-backed des **annonces de groupe** (ADR-46) : round-trip
 * create/list/delete contre une vraie base, et matrice RBAC (coach proprio publie/supprime ;
 * membre actif lit ; non-membre → 404 ; athlète ne publie pas → 403). Le fan-out de
 * notification passe par la file (sans Redis en test, l'enqueue est best-effort et n'échoue pas).
 */
describe('Annonces de groupe — DB intégration (ADR-46)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdUserIds: string[] = [];

  const uniqueEmail = (): string => `ann-${randomUUID()}@ex.test`;
  const PASSWORD = 'Sup3rSecret!';
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const http = () => request(app.getHttpServer());

  async function register(role: 'coach' | 'athlete') {
    const res = await http()
      .post('/api/v1/auth/register')
      .send({ email: uniqueEmail(), password: PASSWORD, role, firstName: 'Ann', lastName: role });
    expect(res.status).toBe(201);
    createdUserIds.push(res.body.user.id);
    return { id: res.body.user.id as string, token: res.body.accessToken as string };
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
      await prisma.groupAnnouncement.deleteMany({ where: { authorId: { in: ids } } });
      await prisma.groupMember.deleteMany({ where: { athleteId: { in: ids } } });
      await prisma.group.deleteMany({ where: { coachId: { in: ids } } });
      await prisma.coachAthleteLink.deleteMany({
        where: { OR: [{ coachId: { in: ids } }, { athleteId: { in: ids } }] },
      });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }
    await app?.close();
  });

  it('round-trip annonces + RBAC', async () => {
    const coach = await register('coach');
    const athlete = await register('athlete');
    const outsider = await register('athlete');

    const group = await http()
      .post('/api/v1/groups')
      .set(bearer(coach.token))
      .send({ name: 'Annonces' })
      .expect(201);
    const groupId = group.body.id as string;
    await http()
      .post('/api/v1/groups/join')
      .set(bearer(athlete.token))
      .send({ inviteCode: group.body.inviteCode })
      .expect(200);

    // Coach publie → 201, auteur = coach.
    const created = await http()
      .post(`/api/v1/groups/${groupId}/announcements`)
      .set(bearer(coach.token))
      .send({ body: 'Séance de samedi déplacée à 10h.' })
      .expect(201);
    expect(created.body.body).toBe('Séance de samedi déplacée à 10h.');
    expect(created.body.author.id).toBe(coach.id);
    const announcementId = created.body.id as string;

    // Athlète membre → lit ; coach → lit ; non-membre → 404 ; athlète ne publie pas → 403.
    const asAthlete = await http()
      .get(`/api/v1/groups/${groupId}/announcements`)
      .set(bearer(athlete.token))
      .expect(200);
    expect(asAthlete.body.data).toHaveLength(1);
    await http()
      .get(`/api/v1/groups/${groupId}/announcements`)
      .set(bearer(coach.token))
      .expect(200);
    await http()
      .get(`/api/v1/groups/${groupId}/announcements`)
      .set(bearer(outsider.token))
      .expect(404);
    await http()
      .post(`/api/v1/groups/${groupId}/announcements`)
      .set(bearer(athlete.token))
      .send({ body: 'intrus' })
      .expect(403);

    // Validation : corps vide → 422.
    await http()
      .post(`/api/v1/groups/${groupId}/announcements`)
      .set(bearer(coach.token))
      .send({ body: '' })
      .expect(422);

    // Suppression (coach) → 204, puis liste vide.
    await http()
      .delete(`/api/v1/groups/${groupId}/announcements/${announcementId}`)
      .set(bearer(coach.token))
      .expect(204);
    const afterDelete = await http()
      .get(`/api/v1/groups/${groupId}/announcements`)
      .set(bearer(coach.token))
      .expect(200);
    expect(afterDelete.body.data).toHaveLength(0);
  });
});
