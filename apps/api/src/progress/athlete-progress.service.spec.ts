import type { ConsentGate } from '../common/authorization/consent.gate';
import type { OwnershipService } from '../common/authorization/ownership.service';
import type { PrismaService } from '../prisma/prisma.service';
import { AthleteProgressService } from './athlete-progress.service';

function consentMock(): ConsentGate {
  return { assertActiveConsent: jest.fn().mockResolvedValue(undefined) } as unknown as ConsentGate;
}

function ownershipMock(): OwnershipService {
  return {
    assertCoachLinkedToAthlete: jest.fn().mockResolvedValue(undefined),
  } as unknown as OwnershipService;
}

function service(
  rows: unknown[],
  consent = consentMock(),
  ownership = ownershipMock(),
): AthleteProgressService {
  const prisma = {
    sessionAssignment: { findMany: jest.fn().mockResolvedValue(rows) },
  } as unknown as PrismaService;
  return new AthleteProgressService(prisma, consent, ownership);
}

const SPRINT_SESSION = {
  exercises: {
    schemaVersion: 2,
    items: [{ name: '60m', order: 0, type: 'sprint', params: { distanceMeters: 60 } }],
  },
};

function assignmentRow(over: Record<string, unknown> = {}) {
  return {
    status: 'completed',
    dueDate: null,
    session: SPRINT_SESSION,
    performance: null,
    ...over,
  };
}

describe('AthleteProgressService (TLX-090, ADR-21)', () => {
  it('exige le consentement data_processing', async () => {
    const consent = consentMock();
    await service([], consent).getMyProgress('a-1');
    expect(consent.assertActiveConsent).toHaveBeenCalledWith('a-1', 'data_processing');
  });

  it('getForCoach (TLX-112) : exige lien actif + coach_access, même dérivation', async () => {
    const consent = consentMock();
    const ownership = ownershipMock();
    const res = await service([], consent, ownership).getForCoach('c-1', 'a-1');
    expect(ownership.assertCoachLinkedToAthlete).toHaveBeenCalledWith('c-1', 'a-1');
    expect(consent.assertActiveConsent).toHaveBeenCalledWith('a-1', 'coach_access');
    expect(res.athleteId).toBe('a-1');
    expect(res.series).toEqual([]);
  });

  it('dérive metrics (StatsMetrics) sur toutes les affectations', async () => {
    const past = new Date('2026-01-01T00:00:00.000Z');
    const res = await service([
      assignmentRow({
        performance: {
          results: { items: [] },
          rpe: 6,
          submittedAt: new Date('2026-06-01T10:00:00.000Z'),
        },
      }),
      assignmentRow({
        performance: {
          results: { items: [] },
          rpe: 8,
          submittedAt: new Date('2026-06-05T10:00:00.000Z'),
        },
      }),
      assignmentRow({ status: 'assigned', dueDate: past }), // échue non réalisée
      assignmentRow({ status: 'assigned', dueDate: null }),
    ]).getMyProgress('a-1');

    expect(res.metrics).toMatchObject({
      assignmentsTotal: 4,
      completed: 2,
      missed: 1,
      completionRate: 0.5,
      avgRpe: 7,
      lastPerformanceAt: '2026-06-05T10:00:00.000Z',
    });
  });

  it('construit une série par épreuve : meilleure marque par perf, points triés par date', async () => {
    const res = await service([
      assignmentRow({
        performance: {
          rpe: null,
          submittedAt: new Date('2026-06-08T10:00:00.000Z'),
          results: {
            items: [
              {
                exerciseName: '60m',
                order: 0,
                setResults: [
                  { set: 1, timeSeconds: 7.52 },
                  { set: 2, timeSeconds: 7.45 },
                ],
              },
            ],
          },
        },
      }),
      assignmentRow({
        performance: {
          rpe: null,
          submittedAt: new Date('2026-06-01T10:00:00.000Z'),
          results: {
            items: [{ exerciseName: '60m', order: 0, setResults: [{ set: 1, timeSeconds: 7.6 }] }],
          },
        },
      }),
    ]).getMyProgress('a-1');

    expect(res.series).toHaveLength(1);
    expect(res.series[0]).toMatchObject({
      eventKey: 'sprint:60m',
      label: '60 m',
      unit: 's',
      direction: 'min',
      points: [
        { date: '2026-06-01', value: 7.6 },
        { date: '2026-06-08', value: 7.45 },
      ],
      // SB & tableau par année dérivés (ADR-34) — env. simulé 2026.
      marksByYear: [{ year: 2026, best: 7.45, count: 2 }],
    });
    expect(res.series[0].seasonBest).toEqual({ date: '2026-06-08', value: 7.45 });
  });

  it('expose SB de l’année en cours et le tableau par année (ADR-34)', async () => {
    const res = await service([
      assignmentRow({
        performance: {
          rpe: null,
          submittedAt: new Date('2025-06-01T10:00:00.000Z'),
          results: {
            items: [{ exerciseName: '60m', order: 0, setResults: [{ set: 1, timeSeconds: 7.7 }] }],
          },
        },
      }),
      assignmentRow({
        performance: {
          rpe: null,
          submittedAt: new Date('2026-04-01T10:00:00.000Z'),
          results: {
            items: [{ exerciseName: '60m', order: 0, setResults: [{ set: 1, timeSeconds: 7.55 }] }],
          },
        },
      }),
    ]).getMyProgress('a-1');

    // Tableau déterministe (dérivé des dates des marques), décroissant par année.
    expect(res.series[0].marksByYear).toEqual([
      { year: 2026, best: 7.55, count: 1 },
      { year: 2025, best: 7.7, count: 1 },
    ]);
    // SB = uniquement l'année en cours (2026).
    expect(res.series[0].seasonBest).toEqual({ date: '2026-04-01', value: 7.55 });
  });

  it('perfs v1 / blocs non mesurables → series vide mais metrics renseignées', async () => {
    const res = await service([
      assignmentRow({
        session: { exercises: { items: [{ name: 'Squat', order: 0 }] } },
        performance: {
          rpe: 7,
          submittedAt: new Date('2026-06-01T10:00:00.000Z'),
          results: {
            items: [{ exerciseName: 'Squat', setResults: [{ set: 1, completed: true }] }],
          },
        },
      }),
    ]).getMyProgress('a-1');

    expect(res.series).toEqual([]);
    expect(res.metrics.completed).toBe(1);
    expect(res.metrics.avgRpe).toBe(7);
  });
});
