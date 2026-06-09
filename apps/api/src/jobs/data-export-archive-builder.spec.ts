import type { PrismaService } from '../prisma/prisma.service';
import { DataExportArchiveBuilder } from './data-export-archive-builder';

const NOW = new Date('2026-06-09T10:00:00.000Z');

/** Construit un PrismaService factice ; chaque modèle renvoie les lignes fournies. */
function prismaMock(user: Record<string, unknown>, rows: Record<string, unknown[]>): PrismaService {
  const many = (key: string) => jest.fn().mockResolvedValue(rows[key] ?? []);
  return {
    user: { findUniqueOrThrow: jest.fn().mockResolvedValue(user) },
    consent: { findMany: many('consent') },
    deviceToken: { findMany: many('deviceToken') },
    exportJob: { findMany: many('exportJob') },
    auditLog: { findMany: many('auditLog') },
    comment: { findMany: many('comment') },
    groupMember: { findMany: many('groupMember') },
    coachAthleteLink: { findMany: many('coachAthleteLink') },
    sessionAssignment: { findMany: many('sessionAssignment') },
    performance: { findMany: many('performance') },
    personalRecord: { findMany: many('personalRecord') },
    group: { findMany: many('group') },
    session: { findMany: many('session') },
  } as unknown as PrismaService;
}

const SECRET_PROFILE = {
  id: 'u1',
  email: 'a@ex.fr',
  firstName: 'Alice',
  lastName: 'Martin',
  sport: 'sprint',
  bio: null,
  photoUrl: null,
  birthDate: null,
  twoFactorEnabled: false,
  createdAt: NOW,
  updatedAt: NOW,
  // Secrets — NE doivent jamais sortir.
  passwordHash: 'HASH-SECRET',
  twoFactorSecret: 'TOTP-SECRET',
};

describe('DataExportArchiveBuilder', () => {
  it('athlète : manifeste complet, sans secrets ni feedback de tiers', async () => {
    const prisma = prismaMock(
      { ...SECRET_PROFILE, role: 'athlete' },
      {
        consent: [
          {
            type: 'data_processing',
            granted: true,
            textVersion: '2026-01',
            grantedAt: NOW,
            revokedAt: null,
            createdAt: NOW,
          },
        ],
        deviceToken: [
          {
            platform: 'apns',
            token: 'DEVICE-TOKEN-SECRET',
            createdAt: NOW,
            lastSeenAt: NOW,
            revokedAt: null,
          },
        ],
        comment: [
          { body: 'mon mot', sessionId: 's1', performanceId: null, createdAt: NOW, updatedAt: NOW },
        ],
        coachAthleteLink: [
          {
            source: 'group',
            coach: { firstName: 'Bob', lastName: 'Coach' },
            createdAt: NOW,
            endedAt: null,
          },
        ],
        performance: [
          {
            results: { items: [] },
            resultsSchemaVersion: 1,
            rpe: 7,
            notes: 'ok',
            submittedAt: NOW,
            createdAt: NOW,
            updatedAt: NOW,
          },
        ],
      },
    );
    const archive = await new DataExportArchiveBuilder(prisma).build('u1');
    const body = archive.body as string;

    expect(archive.contentType).toBe('application/json');
    expect(archive.filename).toContain('u1');
    // Aucun secret ni valeur de device token dans la sortie brute.
    expect(body).not.toContain('HASH-SECRET');
    expect(body).not.toContain('TOTP-SECRET');
    expect(body).not.toContain('DEVICE-TOKEN-SECRET');

    const env = JSON.parse(body);
    expect(env.subject).toEqual({ userId: 'u1', role: 'athlete' });
    expect(env.data.profile).not.toHaveProperty('passwordHash');
    expect(env.data.profile).not.toHaveProperty('twoFactorSecret');
    expect(env.data.performances).toHaveLength(1);
    expect(env.data.commentsAuthored).toHaveLength(1);
    expect(env.data.coachLinks[0].coach).toBe('Bob Coach');
    // Sections coach absentes.
    expect(env.data).not.toHaveProperty('coachedGroups');
  });

  it('coach : objets créés sans aucune identité d’athlète', async () => {
    const prisma = prismaMock(
      { ...SECRET_PROFILE, role: 'coach' },
      {
        group: [
          {
            name: 'Groupe A',
            description: 'desc',
            inviteCode: 'INV',
            _count: { members: 3 },
            createdAt: NOW,
            updatedAt: NOW,
            deletedAt: null,
          },
        ],
        session: [
          {
            title: 'Séance',
            description: null,
            scheduledDate: null,
            status: 'draft',
            exercises: { items: [] },
            exercisesSchemaVersion: 1,
            createdAt: NOW,
            updatedAt: NOW,
            deletedAt: null,
          },
        ],
        coachAthleteLink: [
          {
            source: 'direct',
            groupId: null,
            createdAt: NOW,
            endedAt: null,
            athleteId: 'ATHLETE-SECRET-ID',
          },
        ],
      },
    );
    const archive = await new DataExportArchiveBuilder(prisma).build('u1');
    const body = archive.body as string;

    // Aucune identité d'athlète ne doit fuiter.
    expect(body).not.toContain('ATHLETE-SECRET-ID');

    const env = JSON.parse(body);
    expect(env.subject.role).toBe('coach');
    expect(env.data.coachedGroups[0].memberCount).toBe(3);
    expect(env.data.coachedSessions).toHaveLength(1);
    expect(env.data.coachAthleteLinks[0]).not.toHaveProperty('athleteId');
    // Sections athlète absentes.
    expect(env.data).not.toHaveProperty('performances');
  });
});
