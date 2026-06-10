import type { ConsentGate } from '../common/authorization/consent.gate';
import type { PrismaService } from '../prisma/prisma.service';
import { AthleteProgressService } from './athlete-progress.service';

function consentMock(): ConsentGate {
  return { assertActiveConsent: jest.fn().mockResolvedValue(undefined) } as unknown as ConsentGate;
}

function service(rows: unknown[], consent = consentMock()): AthleteProgressService {
  const prisma = {
    sessionAssignment: { findMany: jest.fn().mockResolvedValue(rows) },
  } as unknown as PrismaService;
  return new AthleteProgressService(prisma, consent);
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

    expect(res.series).toEqual([
      {
        eventKey: 'sprint:60m',
        label: '60 m',
        unit: 's',
        direction: 'min',
        points: [
          { date: '2026-06-01', value: 7.6 },
          { date: '2026-06-08', value: 7.45 },
        ],
      },
    ]);
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
