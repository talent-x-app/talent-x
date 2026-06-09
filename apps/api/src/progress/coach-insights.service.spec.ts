import { ForbiddenException } from '@nestjs/common';
import type { OwnershipService } from '../common/authorization/ownership.service';
import type { ConsentGate } from '../common/authorization/consent.gate';
import type { PrismaService } from '../prisma/prisma.service';
import { CoachInsightsService } from './coach-insights.service';
import { AthleteStatus } from './dto/dashboard.dto';

const COACH = 'c-1';

/** Date passée / future relatives, au format Date sans heure (UTC). */
const YESTERDAY = new Date(Date.UTC(2000, 0, 1));
function tomorrowDate(): Date {
  const d = new Date();
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() + 1);
  return t;
}
function todayDate(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function link(athleteId: string, over: Record<string, unknown> = {}) {
  return {
    athleteId,
    athlete: { id: athleteId, firstName: 'A', lastName: 'T', sport: null, ...over },
  };
}

/** Affectation minimale avec état perf/commentaire. */
function asg(over: Record<string, unknown> = {}) {
  return {
    athleteId: 'a-1',
    status: 'assigned',
    dueDate: null as Date | null,
    performance: null as { id: string; comments: { id: string }[] } | null,
    ...over,
  };
}

function ownershipMock(over: Partial<OwnershipService> = {}): OwnershipService {
  return {
    assertCoachLinkedToAthlete: jest.fn().mockResolvedValue(undefined),
    ...over,
  } as unknown as OwnershipService;
}

function consentMock(over: Partial<ConsentGate> = {}): ConsentGate {
  return {
    assertActiveConsent: jest.fn().mockResolvedValue(undefined),
    ...over,
  } as unknown as ConsentGate;
}

type PrismaMock = {
  coachAthleteLink: Record<string, jest.Mock>;
  sessionAssignment: Record<string, jest.Mock>;
  consent: Record<string, jest.Mock>;
};

function prismaMock(): PrismaMock {
  return {
    coachAthleteLink: { findMany: jest.fn().mockResolvedValue([]) },
    sessionAssignment: { findMany: jest.fn().mockResolvedValue([]) },
    consent: { findMany: jest.fn().mockResolvedValue([]) },
  };
}

function service(
  prisma: PrismaMock,
  ownership = ownershipMock(),
  consent = consentMock(),
): CoachInsightsService {
  return new CoachInsightsService(prisma as unknown as PrismaService, ownership, consent);
}

describe('CoachInsightsService', () => {
  describe('getCoachDashboard', () => {
    it('liste les athlètes liés avec coach_access et statut up_to_date par défaut', async () => {
      const prisma = prismaMock();
      prisma.coachAthleteLink.findMany.mockResolvedValue([link('a-1')]);
      prisma.consent.findMany.mockResolvedValue([{ userId: 'a-1', granted: true }]);

      const res = await service(prisma).getCoachDashboard(COACH);

      expect(res.summary.athleteCount).toBe(1);
      expect(res.athletes[0]).toMatchObject({
        id: 'a-1',
        status: AthleteStatus.UpToDate,
        coachAccessGranted: true,
        overdueCount: 0,
        toReviewCount: 0,
      });
    });

    it('marque En retard une affectation échue non réalisée', async () => {
      const prisma = prismaMock();
      prisma.coachAthleteLink.findMany.mockResolvedValue([link('a-1')]);
      prisma.sessionAssignment.findMany.mockResolvedValue([
        asg({ athleteId: 'a-1', status: 'assigned', dueDate: YESTERDAY }),
      ]);
      const res = await service(prisma).getCoachDashboard(COACH);

      expect(res.athletes[0].status).toBe(AthleteStatus.Late);
      expect(res.athletes[0].overdueCount).toBe(1);
      expect(res.summary.alerts.missedSessions).toBe(1);
    });

    it('marque À revoir une performance sans commentaire du coach', async () => {
      const prisma = prismaMock();
      prisma.coachAthleteLink.findMany.mockResolvedValue([link('a-1')]);
      prisma.sessionAssignment.findMany.mockResolvedValue([
        asg({ athleteId: 'a-1', status: 'completed', performance: { id: 'p1', comments: [] } }),
      ]);
      const res = await service(prisma).getCoachDashboard(COACH);

      expect(res.athletes[0].status).toBe(AthleteStatus.PendingReview);
      expect(res.summary.toReview).toBe(1);
    });

    it('ne compte pas à revoir une perf déjà commentée par le coach', async () => {
      const prisma = prismaMock();
      prisma.coachAthleteLink.findMany.mockResolvedValue([link('a-1')]);
      prisma.sessionAssignment.findMany.mockResolvedValue([
        asg({ status: 'completed', performance: { id: 'p1', comments: [{ id: 'cm1' }] } }),
      ]);
      const res = await service(prisma).getCoachDashboard(COACH);

      expect(res.summary.toReview).toBe(0);
      expect(res.athletes[0].status).toBe(AthleteStatus.UpToDate);
    });

    it('compte les échéances du jour non réalisées', async () => {
      const prisma = prismaMock();
      prisma.coachAthleteLink.findMany.mockResolvedValue([link('a-1')]);
      prisma.sessionAssignment.findMany.mockResolvedValue([
        asg({ status: 'in_progress', dueDate: todayDate() }),
        asg({ status: 'assigned', dueDate: tomorrowDate() }),
      ]);
      const res = await service(prisma).getCoachDashboard(COACH);

      expect(res.summary.today).toBe(1);
    });

    it('signale les consentements coach_access manquants', async () => {
      const prisma = prismaMock();
      prisma.coachAthleteLink.findMany.mockResolvedValue([link('a-1'), link('a-2')]);
      prisma.consent.findMany.mockResolvedValue([{ userId: 'a-1', granted: true }]);
      const res = await service(prisma).getCoachDashboard(COACH);

      expect(res.summary.alerts.consentMissing).toBe(1);
      expect(res.athletes.find((a) => a.id === 'a-2')?.coachAccessGranted).toBe(false);
    });

    it('priorité retard > à revoir', async () => {
      const prisma = prismaMock();
      prisma.coachAthleteLink.findMany.mockResolvedValue([link('a-1')]);
      prisma.sessionAssignment.findMany.mockResolvedValue([
        asg({ status: 'assigned', dueDate: YESTERDAY }),
        asg({ status: 'completed', performance: { id: 'p1', comments: [] } }),
      ]);
      const res = await service(prisma).getCoachDashboard(COACH);
      expect(res.athletes[0].status).toBe(AthleteStatus.Late);
      expect(res.athletes[0].overdueCount).toBe(1);
      expect(res.athletes[0].toReviewCount).toBe(1);
    });
  });

  describe('getAthleteStats', () => {
    it('exige le lien actif et le consentement coach_access', async () => {
      const prisma = prismaMock();
      const ownership = ownershipMock();
      const consent = consentMock();
      await service(prisma, ownership, consent).getAthleteStats(COACH, 'a-1');
      expect(ownership.assertCoachLinkedToAthlete).toHaveBeenCalledWith(COACH, 'a-1');
      expect(consent.assertActiveConsent).toHaveBeenCalledWith('a-1', 'coach_access');
    });

    it('403 si consentement coach_access absent', async () => {
      const prisma = prismaMock();
      const consent = consentMock({
        assertActiveConsent: jest.fn().mockRejectedValue(new ForbiddenException()),
      });
      await expect(
        service(prisma, ownershipMock(), consent).getAthleteStats(COACH, 'a-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('calcule total/completed/missed/taux + avgRpe + dernière perf', async () => {
      const prisma = prismaMock();
      prisma.sessionAssignment.findMany.mockResolvedValue([
        {
          status: 'completed',
          dueDate: null,
          performance: { rpe: 8, submittedAt: new Date('2026-02-01T00:00:00Z') },
        },
        {
          status: 'completed',
          dueDate: null,
          performance: { rpe: 6, submittedAt: new Date('2026-02-05T00:00:00Z') },
        },
        { status: 'assigned', dueDate: YESTERDAY, performance: null },
        { status: 'assigned', dueDate: null, performance: null },
      ]);
      const res = await service(prisma).getAthleteStats(COACH, 'a-1');

      expect(res.metrics).toMatchObject({
        assignmentsTotal: 4,
        completed: 2,
        missed: 1,
        completionRate: 0.5,
        avgRpe: 7,
        lastPerformanceAt: '2026-02-05T00:00:00.000Z',
      });
    });

    it('taux 0 et avgRpe absent quand aucune affectation', async () => {
      const prisma = prismaMock();
      const res = await service(prisma).getAthleteStats(COACH, 'a-1');
      expect(res.metrics.completionRate).toBe(0);
      expect(res.metrics.avgRpe).toBeUndefined();
      expect(res.metrics.lastPerformanceAt).toBeUndefined();
    });
  });
});
