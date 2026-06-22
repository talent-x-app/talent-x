import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { AssignmentStatus } from '../assignments/dto/assignment.dto';
import { AttendanceStatus } from '../assignments/dto/attendance.dto';
import { TeamPulseDto } from './dto/team-pulse.dto';

/**
 * Pouls d'équipe (ADR-48, Palier 1) — surface **100 % dérivée** des `SessionAssignment` du
 * groupe (fan-out ADR-30), sans aucun champ stocké. Gamification douce, **collective et
 * anonyme** : que des entiers agrégés sur la **semaine en cours**, jamais d'identité ni de perf
 * comparée entre pairs (frontière santé/perf ADR-08/21). RBAC = coach propriétaire OU membre actif.
 */
@Injectable()
export class TeamPulseService {
  constructor(private readonly prisma: PrismaService) {}

  /** Agrège le pouls de la semaine ISO en cours. RBAC : coach propriétaire OU athlète membre actif. */
  async getTeamPulse(user: AuthenticatedUser, groupId: string): Promise<TeamPulseDto> {
    await this.assertCanRead(user, groupId);

    const weekStart = isoWeekStart(this.now());
    const weekEnd = addDays(weekStart, 7);
    // Affectations du groupe (fan-out ADR-30) dont la séance est planifiée cette semaine.
    const weekScope = {
      deletedAt: null,
      groupAssignment: { groupId, deletedAt: null },
      session: { scheduledDate: { gte: weekStart, lt: weekEnd }, deletedAt: null },
    } as const;

    const [completedSessions, attendanceGroups, personalRecords] = await Promise.all([
      this.prisma.sessionAssignment.count({
        where: { ...weekScope, status: AssignmentStatus.Completed },
      }),
      this.prisma.sessionAssignment.groupBy({
        by: ['attendance'],
        where: weekScope,
        _count: { id: true },
      }),
      // Records déclenchés cette semaine sur une séance du groupe (PR ↔ perf ↔ affectation ↔ groupe).
      this.prisma.personalRecord.count({
        where: {
          achievedAt: { gte: weekStart, lt: weekEnd },
          performance: { assignment: { groupAssignment: { groupId, deletedAt: null } } },
        },
      }),
    ]);

    return {
      weekStart: toIsoDate(weekStart),
      completedSessions,
      personalRecords,
      attendanceRate: attendanceRate(attendanceGroups),
    };
  }

  /** Horloge isolée pour la testabilité (spyOn). */
  protected now(): Date {
    return new Date();
  }

  /** Lecture autorisée : coach propriétaire OU athlète membre actif (404 anti-énumération sinon). */
  private async assertCanRead(user: AuthenticatedUser, groupId: string): Promise<void> {
    if (user.role === 'coach') {
      const group = await this.prisma.group.findFirst({
        where: { id: groupId, deletedAt: null, coachId: user.id },
        select: { id: true },
      });
      if (!group) throw new NotFoundException('Groupe introuvable.');
      return;
    }
    const membership = await this.prisma.groupMember.findFirst({
      where: { groupId, athleteId: user.id, leftAt: null, group: { deletedAt: null } },
      select: { id: true },
    });
    if (!membership) throw new NotFoundException('Groupe introuvable.');
  }
}

/** Taux de présence = % « going » parmi les réponses RSVP (going/notGoing/maybe). null si aucune. */
function attendanceRate(
  groups: { attendance: string | null; _count: { id: number } }[],
): number | null {
  let going = 0;
  let responded = 0;
  for (const row of groups) {
    if (row.attendance === null) continue; // sans réponse : hors dénominateur
    responded += row._count.id;
    if (row.attendance === AttendanceStatus.Going) going += row._count.id;
  }
  if (responded === 0) return null;
  return Math.round((going / responded) * 100);
}

/** Lundi 00:00 UTC de la semaine ISO contenant `now`. */
function isoWeekStart(now: Date): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = d.getUTCDay(); // 0=dimanche … 6=samedi
  const shiftToMonday = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + shiftToMonday);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/** Date ISO seule (YYYY-MM-DD) — `weekStart` est une borne de jour, pas un instant. */
function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
