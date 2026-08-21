import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { ConsentGate } from '../common/authorization/consent.gate';
import type { PrismaService } from '../prisma/prisma.service';
import type { RecordsService } from '../progress/records.service';
import { TrainingLogService } from './training-log.service';
import type { TrainingLogRequestDto } from './dto/training-log.dto';
import { BlockType } from '../sessions/dto/exercises.dto';

const DTO: TrainingLogRequestDto = {
  title: 'Footing 8 km',
  date: '2026-06-10',
  exercises: {
    schemaVersion: 2,
    items: [
      { name: '5000m', order: 0, type: BlockType.Endurance, params: { distanceMeters: 5000 } },
    ],
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
  session: { create: jest.Mock; update: jest.Mock };
  sessionAssignment: { create: jest.Mock; update: jest.Mock; findFirst: jest.Mock };
  performance: { create: jest.Mock };
  personalRecord: { deleteMany: jest.Mock };
  $transaction: jest.Mock;
};

function prismaMock(): PrismaMock {
  const mock = {
    session: {
      create: jest.fn().mockResolvedValue({ id: 's-1' }),
      update: jest.fn().mockResolvedValue({ id: 's-1' }),
    },
    sessionAssignment: {
      create: jest.fn().mockResolvedValue({ id: 'asg-1' }),
      update: jest.fn().mockResolvedValue({ id: 'asg-1' }),
      // Par défaut : aucune séance libre possédée ne correspond (cas 404).
      findFirst: jest.fn().mockResolvedValue(null),
    },
    performance: { create: jest.fn().mockResolvedValue(performanceRow()) },
    personalRecord: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
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
        // TLX-144 : la séance libre écrit aussi la colonne, cohérente avec le JSONB.
        exercisesSchemaVersion: 2,
        exercises: { schemaVersion: 2, items: DTO.exercises.items },
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
        resultsSchemaVersion: 2,
      }),
    });
    expect(res.id).toBe('perf-1');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('étiquette les exercices à la version courante du contrat quand le client l’omet (v3, ADR-27)', async () => {
    const prisma = prismaMock();
    const dtoNoVersion: TrainingLogRequestDto = {
      ...DTO,
      exercises: { items: DTO.exercises.items },
    };

    await service(prisma).logTrainingSession('a-1', dtoNoVersion);

    const sessionData = prisma.session.create.mock.calls[0][0].data;
    expect(sessionData.exercises).toMatchObject({ schemaVersion: 3 });
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

describe('TrainingLogService.deleteTrainingLogSession (ADR-36 §5, amendement §B1–B3)', () => {
  /** Affectation d'une séance libre possédée, telle que la remonte la garde. */
  function ownedRow(over: Record<string, unknown> = {}) {
    return { id: 'asg-1', sessionId: 's-1', performance: { id: 'perf-1' }, ...over };
  }

  it('soft-delete la séance et l’affectation dans une transaction', async () => {
    const prisma = prismaMock();
    prisma.sessionAssignment.findFirst.mockResolvedValue(ownedRow());

    await service(prisma).deleteTrainingLogSession('a-1', 'asg-1');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.session.update).toHaveBeenCalledWith({
      where: { id: 's-1' },
      data: { deletedAt: expect.any(Date) },
    });
    expect(prisma.sessionAssignment.update).toHaveBeenCalledWith({
      where: { id: 'asg-1' },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it('la garde exige propriété ET séance libre dont l’athlète est l’auteur (§B1)', async () => {
    const prisma = prismaMock();
    prisma.sessionAssignment.findFirst.mockResolvedValue(ownedRow());

    await service(prisma).deleteTrainingLogSession('a-1', 'asg-1');

    // La garde entière est portée par le filtre : pas de lecture large puis vérification.
    expect(prisma.sessionAssignment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'asg-1',
          athleteId: 'a-1',
          deletedAt: null,
          session: expect.objectContaining({
            deletedAt: null,
            coachId: 'a-1',
            status: 'self_logged',
          }),
        }),
      }),
    );
  });

  it('supprime le record confirmé issu de cette performance (§B3)', async () => {
    const prisma = prismaMock();
    prisma.sessionAssignment.findFirst.mockResolvedValue(ownedRow());

    await service(prisma).deleteTrainingLogSession('a-1', 'asg-1');

    // Sans ce geste, le record survivrait à sa source : `personal_records` est matérialisée,
    // et l'ON DELETE SET NULL ne se déclenche qu'à la suppression physique.
    expect(prisma.personalRecord.deleteMany).toHaveBeenCalledWith({
      where: { athleteId: 'a-1', performanceId: 'perf-1' },
    });
  });

  it('aucun record touché si la séance n’a pas de performance', async () => {
    const prisma = prismaMock();
    prisma.sessionAssignment.findFirst.mockResolvedValue(ownedRow({ performance: null }));

    await service(prisma).deleteTrainingLogSession('a-1', 'asg-1');

    expect(prisma.personalRecord.deleteMany).not.toHaveBeenCalled();
    expect(prisma.session.update).toHaveBeenCalled();
  });

  it('ne recalcule aucun record antérieur : un record est revendiqué, pas agrégé (§B3)', async () => {
    const prisma = prismaMock();
    const records = recordsMock();
    prisma.sessionAssignment.findFirst.mockResolvedValue(ownedRow());

    await service(prisma, consentMock(), records).deleteTrainingLogSession('a-1', 'asg-1');

    // Re-dériver la meilleure marque restante inscrirait un record jamais confirmé (ADR-20/32).
    expect(records.detectCandidates).not.toHaveBeenCalled();
  });

  it('séance d’un coach : 404, aucune écriture (non-fuite)', async () => {
    const prisma = prismaMock();
    // La garde ne remonte rien : `status: self_logged` + `coachId: athleteId` ne matchent pas.
    prisma.sessionAssignment.findFirst.mockResolvedValue(null);

    await expect(
      service(prisma).deleteTrainingLogSession('a-1', 'asg-du-coach'),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.session.update).not.toHaveBeenCalled();
    expect(prisma.personalRecord.deleteMany).not.toHaveBeenCalled();
  });

  it('séance libre d’un AUTRE athlète : 404, aucune écriture (non-fuite)', async () => {
    const prisma = prismaMock();
    prisma.sessionAssignment.findFirst.mockResolvedValue(null);

    await expect(
      service(prisma).deleteTrainingLogSession('a-2', 'asg-de-a-1'),
    ).rejects.toBeInstanceOf(NotFoundException);

    // 404 et non 403 : « pas à toi » et « n'existe pas » sont indistinguables (anti-énumération).
    expect(prisma.sessionAssignment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ athleteId: 'a-2' }) }),
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('séance déjà supprimée : 404 (idempotent du point de vue de l’appelant)', async () => {
    const prisma = prismaMock();
    prisma.sessionAssignment.findFirst.mockResolvedValue(null);

    await expect(service(prisma).deleteTrainingLogSession('a-1', 'asg-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
