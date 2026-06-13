import { ForbiddenException } from '@nestjs/common';
import type { ConsentGate } from '../common/authorization/consent.gate';
import type { PrismaService } from '../prisma/prisma.service';
import type { RecordsService } from '../progress/records.service';
import { TrainingLogService } from './training-log.service';
import type { TrainingLogRequestDto } from './dto/training-log.dto';

const DTO: TrainingLogRequestDto = {
  title: 'Footing 8 km',
  date: '2026-06-10',
  exercises: {
    schemaVersion: 2,
    items: [{ name: '5000m', order: 0, type: 'endurance', params: { distanceMeters: 5000 } }],
  },
  results: {
    schemaVersion: 2,
    items: [{ exerciseName: '5000m', order: 0, setResults: [{ set: 1, timeSeconds: 1500 }] }],
  },
  rpe: 5,
  notes: 'tranquille',
};

function performanceRow(over: Record<string, unknown> = {}) {
  return {
    id: 'perf-1',
    assignmentId: 'asg-1',
    athleteId: 'a-1',
    results: DTO.results,
    resultsSchemaVersion: 2,
    rpe: 5,
    notes: 'tranquille',
    submittedAt: new Date('2026-06-10T00:00:00.000Z'),
    createdAt: new Date('2026-06-10T00:00:00.000Z'),
    updatedAt: new Date('2026-06-10T00:00:00.000Z'),
    ...over,
  };
}

function consentMock(over: Partial<ConsentGate> = {}): ConsentGate {
  return {
    assertActiveConsent: jest.fn().mockResolvedValue(undefined),
    ...over,
  } as unknown as ConsentGate;
}

function recordsMock(over: Partial<RecordsService> = {}): RecordsService {
  return {
    detectCandidates: jest.fn().mockResolvedValue([]),
    ...over,
  } as unknown as RecordsService;
}

type PrismaMock = {
  session: { create: jest.Mock };
  sessionAssignment: { create: jest.Mock };
  performance: { create: jest.Mock };
  $transaction: jest.Mock;
};

function prismaMock(): PrismaMock {
  const mock = {
    session: { create: jest.fn().mockResolvedValue({ id: 's-1' }) },
    sessionAssignment: { create: jest.fn().mockResolvedValue({ id: 'asg-1' }) },
    performance: { create: jest.fn().mockResolvedValue(performanceRow()) },
    $transaction: jest.fn((arg: unknown) => (arg as (tx: unknown) => unknown)(mock)),
  } as PrismaMock;
  return mock;
}

function service(prisma: PrismaMock, consent = consentMock(), records = recordsMock()) {
  return new TrainingLogService(prisma as unknown as PrismaService, consent, records);
}

describe('TrainingLogService (ADR-36)', () => {
  it('crée séance self_logged + affectation completed + perf (datées) en une transaction', async () => {
    const prisma = prismaMock();
    const consent = consentMock();

    const res = await service(prisma, consent).logTrainingSession('a-1', DTO);

    expect(consent.assertActiveConsent).toHaveBeenCalledWith('a-1', 'data_processing');
    expect(prisma.session.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        coachId: 'a-1', // séance libre : l'athlète est son propre propriétaire
        title: 'Footing 8 km',
        status: 'self_logged',
        scheduledDate: new Date('2026-06-10'),
      }),
    });
    expect(prisma.sessionAssignment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sessionId: 's-1',
        athleteId: 'a-1',
        status: 'completed',
        dueDate: new Date('2026-06-10'),
      }),
    });
    expect(prisma.performance.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        assignmentId: 'asg-1',
        athleteId: 'a-1',
        rpe: 5,
        submittedAt: new Date('2026-06-10'),
      }),
    });
    expect(res.id).toBe('perf-1');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('exige le consentement data_processing (rien créé sinon)', async () => {
    const prisma = prismaMock();
    const consent = consentMock({
      assertActiveConsent: jest.fn().mockRejectedValue(new ForbiddenException()),
    });

    await expect(service(prisma, consent).logTrainingSession('a-1', DTO)).rejects.toThrow(
      ForbiddenException,
    );
    expect(prisma.session.create).not.toHaveBeenCalled();
  });

  it('joint les candidats record détectés (ADR-20)', async () => {
    const prisma = prismaMock();
    const candidate = {
      eventKey: 'endurance:5000m',
      label: '5000 m',
      value: 1500,
      unit: 's' as const,
    };
    const records = recordsMock({
      detectCandidates: jest.fn().mockResolvedValue([candidate]),
    } as Partial<RecordsService>);

    const res = await service(prisma, consentMock(), records).logTrainingSession('a-1', DTO);

    expect(records.detectCandidates).toHaveBeenCalledWith(
      'a-1',
      DTO.exercises.items,
      DTO.results.items,
    );
    expect(res.recordCandidates).toEqual([candidate]);
  });

  it('une détection record en échec ne fait jamais échouer la saisie', async () => {
    const prisma = prismaMock();
    const records = recordsMock({
      detectCandidates: jest.fn().mockRejectedValue(new Error('boom')),
    } as Partial<RecordsService>);

    const res = await service(prisma, consentMock(), records).logTrainingSession('a-1', DTO);

    expect(res.id).toBe('perf-1');
    expect(res.recordCandidates).toBeUndefined();
  });
});
