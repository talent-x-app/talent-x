import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Prisma, PrismaClient } from '@prisma/client';
import type { SampleData } from '../src/seed/sample-data.types';
import { validateSampleData } from '../src/seed/validate-sample-data';

/**
 * Seed de la base de DÉVELOPPEMENT (TLX-014) depuis talent-x-sample-data.json.
 * Idempotent : vide les tables métier puis réinsère le jeu de référence.
 * Exécuter : `pnpm --filter @talent-x/api seed` (après `migrate deploy`).
 */

// Placeholder de mot de passe (dev) : password_hash est NOT NULL. Les comptes
// seedés ne sont pas connectables tant que l'authentification (Argon2, ticket
// Auth) n'est pas livrée ; ce hash sera régénéré à ce moment. Aucun secret réel.
const SEED_PASSWORD_HASH = 'seed$dev$not-a-real-hash';

const asJson = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const raw = readFileSync(join(__dirname, 'talent-x-sample-data.json'), 'utf-8');
  const data = validateSampleData(JSON.parse(raw) as SampleData);

  try {
    await prisma.$transaction(async (tx) => {
      // Purge en ordre FK-safe.
      await tx.comment.deleteMany();
      await tx.performance.deleteMany();
      await tx.sessionAssignment.deleteMany();
      await tx.session.deleteMany();
      await tx.coachAthleteLink.deleteMany();
      await tx.groupMember.deleteMany();
      await tx.group.deleteMany();
      await tx.consent.deleteMany();
      await tx.refreshToken.deleteMany();
      await tx.deviceToken.deleteMany();
      await tx.auditLog.deleteMany();
      await tx.user.deleteMany();

      const userId = new Map<string, string>();
      for (const u of data.users) {
        const r = await tx.user.create({
          data: {
            email: u.email,
            passwordHash: SEED_PASSWORD_HASH,
            role: u.role,
            firstName: u.firstName,
            lastName: u.lastName,
            sport: u.sport ?? null,
            bio: u.bio ?? null,
            photoUrl: u.photoUrl ?? null,
          },
        });
        userId.set(u.key, r.id);
      }

      for (const c of data.consents ?? []) {
        await tx.consent.create({
          data: {
            userId: userId.get(c.user)!,
            type: c.type,
            granted: c.granted,
            textVersion: c.textVersion,
            grantedAt: c.granted ? new Date() : null,
            revokedAt: c.granted ? null : new Date(),
          },
        });
      }

      const groupId = new Map<string, string>();
      for (const g of data.groups ?? []) {
        const r = await tx.group.create({
          data: {
            coachId: userId.get(g.coach)!,
            name: g.name,
            description: g.description ?? null,
            inviteCode: g.inviteCode,
          },
        });
        groupId.set(g.key, r.id);
        for (const member of g.members) {
          await tx.groupMember.create({
            data: { groupId: r.id, athleteId: userId.get(member)! },
          });
          await tx.coachAthleteLink.create({
            data: {
              coachId: userId.get(g.coach)!,
              athleteId: userId.get(member)!,
              source: 'group',
              groupId: r.id,
            },
          });
        }
      }

      const sessionId = new Map<string, string>();
      for (const s of data.sessions ?? []) {
        const r = await tx.session.create({
          data: {
            coachId: userId.get(s.coach)!,
            title: s.title,
            description: s.description ?? null,
            scheduledDate: s.scheduledDate ? new Date(s.scheduledDate) : null,
            status: s.status,
            exercises: asJson(s.exercises),
            exercisesSchemaVersion: s.exercises.schemaVersion ?? 1,
          },
        });
        sessionId.set(s.key, r.id);
      }

      const assignmentId = new Map<string, string>();
      for (const a of data.assignments ?? []) {
        const r = await tx.sessionAssignment.create({
          data: {
            sessionId: sessionId.get(a.session)!,
            athleteId: userId.get(a.athlete)!,
            status: a.status,
            dueDate: a.dueDate ? new Date(a.dueDate) : null,
          },
        });
        assignmentId.set(a.key, r.id);
      }

      const performanceIdByAssignment = new Map<string, string>();
      for (const p of data.performances ?? []) {
        const r = await tx.performance.create({
          data: {
            assignmentId: assignmentId.get(p.assignment)!,
            athleteId: userId.get(p.athlete)!,
            results: asJson(p.results),
            resultsSchemaVersion: p.results.schemaVersion ?? 1,
            rpe: p.rpe ?? null,
            notes: p.notes ?? null,
          },
        });
        performanceIdByAssignment.set(p.assignment, r.id);
      }

      for (const c of data.comments ?? []) {
        await tx.comment.create({
          data: {
            authorId: userId.get(c.author)!,
            sessionId: c.session ? sessionId.get(c.session)! : null,
            performanceId: c.performance ? performanceIdByAssignment.get(c.performance)! : null,
            body: c.body,
          },
        });
      }
    });

    const counts = {
      users: data.users.length,
      groups: data.groups?.length ?? 0,
      sessions: data.sessions?.length ?? 0,
      assignments: data.assignments?.length ?? 0,
      performances: data.performances?.length ?? 0,
    };
    console.log('Seed terminé :', JSON.stringify(counts));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Échec du seed :', error);
  process.exit(1);
});
