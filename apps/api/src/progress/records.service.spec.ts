import {
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { OwnershipService } from '../common/authorization/ownership.service';
import type { ConsentGate } from '../common/authorization/consent.gate';
import type { PrismaService } from '../prisma/prisma.service';
import { BlockType } from '../sessions/dto/exercises.dto';
import { RecordsService } from './records.service';

function ownershipMock(): OwnershipService {
  return {
    assertCoachLinkedToAthlete: jest.fn().mockResolvedValue(undefined),
  } as unknown as OwnershipService;
}

function consentMock(): ConsentGate {
  return { assertActiveConsent: jest.fn().mockResolvedValue(undefined) } as unknown as ConsentGate;
}

type PrismaMock = {
  personalRecord: Record<string, jest.Mock>;
  performance: Record<string, jest.Mock>;
};

function prismaMock(): PrismaMock {
  return {
    personalRecord: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn(),
    },
    performance: { findUnique: jest.fn() },
  };
}

function recordRow(over: Record<string, unknown> = {}) {
  return {
    id: 'rec-1',
    athleteId: 'a-1',
    eventKey: 'sprint:60m',
    label: '60 m',
    value: '7.62',
    unit: 's',
    direction: 'min',
    achievedAt: new Date('2026-06-01T00:00:00.000Z'),
    performanceId: 'perf-0',
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: new Date('2026-06-01T00:00:00.000Z'),
    ...over,
  };
}

function performanceRow(over: Record<string, unknown> = {}) {
  return {
    id: 'perf-1',
    assignmentId: 'asg-1',
    athleteId: 'a-1',
    results: {
      schemaVersion: 2,
      items: [{ exerciseName: '60m', order: 0, setResults: [{ set: 1, timeSeconds: 7.45 }] }],
    },
    submittedAt: new Date('2026-06-10T10:00:00.000Z'),
    assignment: {
      session: {
        exercises: {
          schemaVersion: 2,
          items: [{ name: '60m', order: 0, type: 'sprint', params: { distanceMeters: 60 } }],
        },
      },
    },
    ...over,
  };
}

function service(
  prisma: PrismaMock,
  ownership = ownershipMock(),
  consent = consentMock(),
): RecordsService {
  return new RecordsService(prisma as unknown as PrismaService, ownership, consent);
}

describe('RecordsService (TLX-076, ADR-20)', () => {
  describe('listForCoach', () => {
    it('exige le lien actif et le consentement coach_access', async () => {
      const prisma = prismaMock();
      const ownership = ownershipMock();
      const consent = consentMock();
      prisma.personalRecord.findMany.mockResolvedValue([recordRow()]);

      const res = await service(prisma, ownership, consent).listForCoach('c-1', 'a-1');

      expect(ownership.assertCoachLinkedToAthlete).toHaveBeenCalledWith('c-1', 'a-1');
      expect(consent.assertActiveConsent).toHaveBeenCalledWith('a-1', 'coach_access');
      expect(res.items[0]).toMatchObject({ eventKey: 'sprint:60m', value: 7.62, unit: 's' });
    });
  });

  describe('detectCandidates', () => {
    const EXERCISES = [
      { name: '60m', order: 0, type: BlockType.Sprint, params: { distanceMeters: 60 } },
    ];
    const RESULTS = [
      { exerciseName: '60m', order: 0, setResults: [{ set: 1, timeSeconds: 7.45 }] },
    ];

    it('épreuve vierge → candidat sans previousValue', async () => {
      const prisma = prismaMock();
      const res = await service(prisma).detectCandidates('a-1', EXERCISES, RESULTS);
      expect(res).toEqual([
        { eventKey: 'sprint:60m', label: '60 m', value: 7.45, unit: 's', previousValue: undefined },
      ]);
    });

    it('record battu → candidat avec previousValue ; non battu → rien', async () => {
      const prisma = prismaMock();
      prisma.personalRecord.findMany.mockResolvedValue([recordRow()]); // 7.62
      const better = await service(prisma).detectCandidates('a-1', EXERCISES, RESULTS);
      expect(better).toEqual([expect.objectContaining({ value: 7.45, previousValue: 7.62 })]);

      prisma.personalRecord.findMany.mockResolvedValue([recordRow({ value: '7.40' })]);
      const worse = await service(prisma).detectCandidates('a-1', EXERCISES, RESULTS);
      expect(worse).toEqual([]);
    });

    it('perf sans bloc mesurable → liste vide sans requête', async () => {
      const prisma = prismaMock();
      const res = await service(prisma).detectCandidates(
        'a-1',
        [{ name: 'Gainage' }],
        [{ exerciseName: 'Gainage', setResults: [{ set: 1, completed: true }] }],
      );
      expect(res).toEqual([]);
      expect(prisma.personalRecord.findMany).not.toHaveBeenCalled();
    });
  });

  describe('confirm', () => {
    it('upsert le record depuis la perf (valeur revalidée, consentement requis)', async () => {
      const prisma = prismaMock();
      const consent = consentMock();
      prisma.performance.findUnique.mockResolvedValue(performanceRow());
      prisma.personalRecord.upsert.mockResolvedValue(
        recordRow({ value: '7.45', performanceId: 'perf-1' }),
      );

      const res = await service(prisma, ownershipMock(), consent).confirm(
        'a-1',
        'sprint:60m',
        'perf-1',
      );

      expect(consent.assertActiveConsent).toHaveBeenCalledWith('a-1', 'data_processing');
      expect(prisma.personalRecord.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { athleteId_eventKey: { athleteId: 'a-1', eventKey: 'sprint:60m' } },
          create: expect.objectContaining({ value: 7.45, unit: 's', direction: 'min' }),
        }),
      );
      expect(res.value).toBe(7.45);
    });

    it('404 perf inconnue, 403 perf d’un autre athlète', async () => {
      const prisma = prismaMock();
      prisma.performance.findUnique.mockResolvedValue(null);
      await expect(service(prisma).confirm('a-1', 'sprint:60m', 'nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );

      prisma.performance.findUnique.mockResolvedValue(performanceRow({ athleteId: 'autre' }));
      await expect(service(prisma).confirm('a-1', 'sprint:60m', 'perf-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('422 si l’épreuve est absente de la perf ou si la marque n’améliore pas', async () => {
      const prisma = prismaMock();
      prisma.performance.findUnique.mockResolvedValue(performanceRow());
      await expect(service(prisma).confirm('a-1', 'jumps', 'perf-1')).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );

      prisma.personalRecord.findUnique.mockResolvedValue(recordRow({ value: '7.40' }));
      await expect(service(prisma).confirm('a-1', 'sprint:60m', 'perf-1')).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      expect(prisma.personalRecord.upsert).not.toHaveBeenCalled();
    });
  });
});
