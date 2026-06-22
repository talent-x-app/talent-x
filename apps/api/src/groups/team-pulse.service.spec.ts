import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { TeamPulseService } from './team-pulse.service';

const COACH: AuthenticatedUser = { id: 'c-1', role: 'coach' };
const ATHLETE: AuthenticatedUser = { id: 'a-1', role: 'athlete' };

type PrismaMock = {
  group: { findFirst: jest.Mock };
  groupMember: { findFirst: jest.Mock };
  sessionAssignment: { count: jest.Mock; groupBy: jest.Mock };
  personalRecord: { count: jest.Mock };
};

function prismaMock(): PrismaMock {
  return {
    group: { findFirst: jest.fn() },
    groupMember: { findFirst: jest.fn() },
    sessionAssignment: {
      count: jest.fn().mockResolvedValue(0),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    personalRecord: { count: jest.fn().mockResolvedValue(0) },
  };
}

/** Service avec horloge figée (mercredi 2026-06-24 → semaine du lundi 2026-06-22). */
function service(prisma: PrismaMock, now = new Date('2026-06-24T12:00:00.000Z')): TeamPulseService {
  const svc = new TeamPulseService(prisma as unknown as PrismaService);
  jest.spyOn(svc as unknown as { now: () => Date }, 'now').mockReturnValue(now);
  return svc;
}

describe('TeamPulseService (ADR-48, Palier 1)', () => {
  describe('RBAC', () => {
    it('coach propriétaire : autorisé', async () => {
      const prisma = prismaMock();
      prisma.group.findFirst.mockResolvedValue({ id: 'g-1' });
      await expect(service(prisma).getTeamPulse(COACH, 'g-1')).resolves.toBeDefined();
    });

    it('athlète membre actif : autorisé', async () => {
      const prisma = prismaMock();
      prisma.groupMember.findFirst.mockResolvedValue({ id: 'm-1' });
      await expect(service(prisma).getTeamPulse(ATHLETE, 'g-1')).resolves.toBeDefined();
    });

    it('athlète non-membre → 404', async () => {
      const prisma = prismaMock();
      prisma.groupMember.findFirst.mockResolvedValue(null);
      await expect(service(prisma).getTeamPulse(ATHLETE, 'g-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('coach non propriétaire → 404', async () => {
      const prisma = prismaMock();
      prisma.group.findFirst.mockResolvedValue(null);
      await expect(service(prisma).getTeamPulse(COACH, 'g-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('agrégat dérivé', () => {
    it('compte les séances terminées + records, et borne le scope au groupe et à la semaine', async () => {
      const prisma = prismaMock();
      prisma.groupMember.findFirst.mockResolvedValue({ id: 'm-1' });
      prisma.sessionAssignment.count.mockResolvedValue(42);
      prisma.personalRecord.count.mockResolvedValue(8);
      prisma.sessionAssignment.groupBy.mockResolvedValue([
        { attendance: 'going', _count: { id: 8 } },
        { attendance: 'maybe', _count: { id: 2 } },
        { attendance: null, _count: { id: 5 } },
      ]);

      const res = await service(prisma).getTeamPulse(ATHLETE, 'g-1');

      expect(res.completedSessions).toBe(42);
      expect(res.personalRecords).toBe(8);
      // going (8) / réponses (going 8 + maybe 2 = 10) → 80 % ; les « sans réponse » sont exclus.
      expect(res.attendanceRate).toBe(80);
      // Semaine ISO figée : lundi 2026-06-22.
      expect(res.weekStart).toBe('2026-06-22');

      // Scope : séances terminées du groupe (fan-out) dont la séance est planifiée cette semaine.
      const countArg = prisma.sessionAssignment.count.mock.calls[0][0];
      expect(countArg.where.status).toBe('completed');
      expect(countArg.where.groupAssignment).toEqual({ groupId: 'g-1', deletedAt: null });
      expect(countArg.where.session.scheduledDate.gte).toEqual(
        new Date('2026-06-22T00:00:00.000Z'),
      );
      expect(countArg.where.session.scheduledDate.lt).toEqual(new Date('2026-06-29T00:00:00.000Z'));
      // Record rattaché à une perf d'une affectation du groupe.
      const prArg = prisma.personalRecord.count.mock.calls[0][0];
      expect(prArg.where.performance.assignment.groupAssignment).toEqual({
        groupId: 'g-1',
        deletedAt: null,
      });
    });

    it('aucune réponse RSVP → attendanceRate null', async () => {
      const prisma = prismaMock();
      prisma.groupMember.findFirst.mockResolvedValue({ id: 'm-1' });
      prisma.sessionAssignment.groupBy.mockResolvedValue([{ attendance: null, _count: { id: 5 } }]);
      const res = await service(prisma).getTeamPulse(ATHLETE, 'g-1');
      expect(res.attendanceRate).toBeNull();
    });

    it('100 % présents quand toutes les réponses sont « going »', async () => {
      const prisma = prismaMock();
      prisma.groupMember.findFirst.mockResolvedValue({ id: 'm-1' });
      prisma.sessionAssignment.groupBy.mockResolvedValue([
        { attendance: 'going', _count: { id: 7 } },
      ]);
      const res = await service(prisma).getTeamPulse(ATHLETE, 'g-1');
      expect(res.attendanceRate).toBe(100);
    });
  });
});
