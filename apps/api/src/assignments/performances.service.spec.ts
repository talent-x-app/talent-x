import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { OwnershipService } from '../common/authorization/ownership.service';
import type { ConsentGate } from '../common/authorization/consent.gate';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import type { RecordsService } from '../progress/records.service';
import { PerformancesService } from './performances.service';

const ATHLETE: AuthenticatedUser = { id: 'a-1', role: 'athlete' };
const COACH: AuthenticatedUser = { id: 'c-1', role: 'coach' };

const DTO = { results: { items: [{ exerciseName: '60m', order: 1 }] }, rpe: 8, notes: 'ok' };

function assignmentRow(over: Record<string, unknown> = {}) {
  return {
    id: 'asg-1',
    sessionId: 's-1',
    athleteId: 'a-1',
    status: 'assigned',
    deletedAt: null,
    ...over,
  };
}

function performanceRow(over: Record<string, unknown> = {}) {
  return {
    id: 'perf-1',
    assignmentId: 'asg-1',
    athleteId: 'a-1',
    results: { schemaVersion: 1, items: [{ exerciseName: '60m', order: 1 }] },
    resultsSchemaVersion: 1,
    rpe: 8,
    notes: 'ok',
    submittedAt: new Date('2026-02-01T00:00:00.000Z'),
    createdAt: new Date('2026-02-01T00:00:00.000Z'),
    updatedAt: new Date('2026-02-01T00:00:00.000Z'),
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
  sessionAssignment: Record<string, jest.Mock>;
  performance: Record<string, jest.Mock>;
  auditLog: Record<string, jest.Mock>;
  $transaction: jest.Mock;
};

function prismaMock(): PrismaMock {
  const mock: PrismaMock = {
    sessionAssignment: {
      findFirst: jest.fn(),
      update: jest.fn(),
      // Fluent `findUnique(...).session(...)` (détection record, ADR-20).
      findUnique: jest.fn(() => ({ session: jest.fn().mockResolvedValue(null) })),
    },
    performance: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn((arg: unknown) =>
      Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(mock),
    ),
  };
  return mock;
}

function recordsMock(over: Partial<RecordsService> = {}): RecordsService {
  return {
    detectCandidates: jest.fn().mockResolvedValue([]),
    ...over,
  } as unknown as RecordsService;
}

function service(
  prisma: PrismaMock,
  ownership = ownershipMock(),
  consent = consentMock(),
  records = recordsMock(),
): PerformancesService {
  return new PerformancesService(prisma as unknown as PrismaService, ownership, consent, records);
}

describe('PerformancesService', () => {
  describe('submitPerformance', () => {
    it('crée la performance, vérifie le consentement et passe l’affectation à completed', async () => {
      const prisma = prismaMock();
      const consent = consentMock();
      prisma.sessionAssignment.findFirst.mockResolvedValue(assignmentRow());
      prisma.performance.findUnique.mockResolvedValue(null);
      prisma.performance.create.mockResolvedValue(performanceRow());
      prisma.sessionAssignment.update.mockResolvedValue(assignmentRow({ status: 'completed' }));

      const res = await service(prisma, ownershipMock(), consent).submitPerformance(
        ATHLETE,
        'asg-1',
        DTO,
      );

      expect(consent.assertActiveConsent).toHaveBeenCalledWith('a-1', 'data_processing');
      expect(prisma.performance.create).toHaveBeenCalledTimes(1);
      expect(prisma.sessionAssignment.update).toHaveBeenCalledWith({
        where: { id: 'asg-1' },
        data: { status: 'completed' },
      });
      expect(res.id).toBe('perf-1');
    });

    it('joint les candidats record à la réponse quand la détection en trouve (ADR-20)', async () => {
      const prisma = prismaMock();
      prisma.sessionAssignment.findFirst.mockResolvedValue(assignmentRow());
      prisma.performance.findUnique.mockResolvedValue(null);
      prisma.performance.create.mockResolvedValue(performanceRow());
      prisma.sessionAssignment.update.mockResolvedValue(assignmentRow({ status: 'completed' }));
      prisma.sessionAssignment.findUnique.mockReturnValue({
        session: jest.fn().mockResolvedValue({
          exercises: { items: [{ name: '60m', order: 1, type: 'sprint' }] },
        }),
      });
      const candidate = { eventKey: 'sprint:60m', label: '60 m', value: 7.45, unit: 's' as const };
      const records = recordsMock({
        detectCandidates: jest.fn().mockResolvedValue([candidate]),
      } as Partial<RecordsService>);

      const res = await service(prisma, ownershipMock(), consentMock(), records).submitPerformance(
        ATHLETE,
        'asg-1',
        DTO,
      );

      expect(records.detectCandidates).toHaveBeenCalledWith(
        'a-1',
        [{ name: '60m', order: 1, type: 'sprint' }],
        DTO.results.items,
      );
      expect(res.recordCandidates).toEqual([candidate]);
    });

    it('la détection record ne fait jamais échouer la saisie (best effort)', async () => {
      const prisma = prismaMock();
      prisma.sessionAssignment.findFirst.mockResolvedValue(assignmentRow());
      prisma.performance.findUnique.mockResolvedValue(null);
      prisma.performance.create.mockResolvedValue(performanceRow());
      prisma.sessionAssignment.update.mockResolvedValue(assignmentRow({ status: 'completed' }));
      const records = recordsMock({
        detectCandidates: jest.fn().mockRejectedValue(new Error('boom')),
      } as Partial<RecordsService>);

      const res = await service(prisma, ownershipMock(), consentMock(), records).submitPerformance(
        ATHLETE,
        'asg-1',
        DTO,
      );

      expect(res.id).toBe('perf-1');
      expect(res.recordCandidates).toBeUndefined();
    });

    it('idempotent : renvoie la performance existante sans recréer ni changer le statut', async () => {
      const prisma = prismaMock();
      prisma.sessionAssignment.findFirst.mockResolvedValue(assignmentRow());
      prisma.performance.findUnique.mockResolvedValue(performanceRow());

      const res = await service(prisma).submitPerformance(ATHLETE, 'asg-1', DTO);

      expect(prisma.performance.create).not.toHaveBeenCalled();
      expect(prisma.sessionAssignment.update).not.toHaveBeenCalled();
      expect(res.id).toBe('perf-1');
    });

    it('403 si l’affectation appartient à un autre athlète', async () => {
      const prisma = prismaMock();
      prisma.sessionAssignment.findFirst.mockResolvedValue(assignmentRow({ athleteId: 'other' }));
      await expect(service(prisma).submitPerformance(ATHLETE, 'asg-1', DTO)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('404 si l’affectation est introuvable', async () => {
      const prisma = prismaMock();
      prisma.sessionAssignment.findFirst.mockResolvedValue(null);
      await expect(service(prisma).submitPerformance(ATHLETE, 'asg-x', DTO)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('403 CONSENT_REQUIRED si data_processing inactif', async () => {
      const prisma = prismaMock();
      prisma.sessionAssignment.findFirst.mockResolvedValue(assignmentRow());
      const consent = consentMock({
        assertActiveConsent: jest.fn().mockRejectedValue(new ForbiddenException()),
      });
      await expect(
        service(prisma, ownershipMock(), consent).submitPerformance(ATHLETE, 'asg-1', DTO),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.performance.create).not.toHaveBeenCalled();
    });
  });

  describe('getPerformance', () => {
    it('athlète titulaire : autorisé', async () => {
      const prisma = prismaMock();
      prisma.sessionAssignment.findFirst.mockResolvedValue({
        ...assignmentRow(),
        session: { coachId: 'c-1' },
        performance: performanceRow(),
      });
      const res = await service(prisma).getPerformance(ATHLETE, 'asg-1');
      expect(res.id).toBe('perf-1');
    });

    it('404 si pas de performance soumise', async () => {
      const prisma = prismaMock();
      prisma.sessionAssignment.findFirst.mockResolvedValue({
        ...assignmentRow(),
        session: { coachId: 'c-1' },
        performance: null,
      });
      await expect(service(prisma).getPerformance(ATHLETE, 'asg-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('coach propriétaire : lien + coach_access requis', async () => {
      const prisma = prismaMock();
      const ownership = ownershipMock();
      const consent = consentMock();
      prisma.sessionAssignment.findFirst.mockResolvedValue({
        ...assignmentRow(),
        session: { coachId: 'c-1' },
        performance: performanceRow(),
      });
      await service(prisma, ownership, consent).getPerformance(COACH, 'asg-1');
      expect(ownership.assertCoachLinkedToAthlete).toHaveBeenCalledWith('c-1', 'a-1');
      expect(consent.assertActiveConsent).toHaveBeenCalledWith('a-1', 'coach_access');
    });

    it('coach d’une autre séance : 403', async () => {
      const prisma = prismaMock();
      prisma.sessionAssignment.findFirst.mockResolvedValue({
        ...assignmentRow(),
        session: { coachId: 'other' },
        performance: performanceRow(),
      });
      await expect(service(prisma).getPerformance(COACH, 'asg-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('athlète non titulaire : 403', async () => {
      const prisma = prismaMock();
      prisma.sessionAssignment.findFirst.mockResolvedValue({
        ...assignmentRow({ athleteId: 'other' }),
        session: { coachId: 'c-1' },
        performance: performanceRow({ athleteId: 'other' }),
      });
      await expect(service(prisma).getPerformance(ATHLETE, 'asg-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('updatePerformance', () => {
    it('met à jour la performance du titulaire', async () => {
      const prisma = prismaMock();
      prisma.sessionAssignment.findFirst.mockResolvedValue(assignmentRow());
      prisma.performance.findUnique.mockResolvedValue(performanceRow());
      prisma.performance.update.mockResolvedValue(performanceRow({ notes: 'maj' }));
      const res = await service(prisma).updatePerformance(ATHLETE, 'asg-1', {
        ...DTO,
        notes: 'maj',
      });
      expect(res.notes).toBe('maj');
    });

    it('404 si pas encore soumise', async () => {
      const prisma = prismaMock();
      prisma.sessionAssignment.findFirst.mockResolvedValue(assignmentRow());
      prisma.performance.findUnique.mockResolvedValue(null);
      await expect(service(prisma).updatePerformance(ATHLETE, 'asg-1', DTO)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('écrit une trace d’audit before/after à chaque correction effective (RB-06, ADR-33)', async () => {
      const prisma = prismaMock();
      prisma.sessionAssignment.findFirst.mockResolvedValue(assignmentRow());
      prisma.performance.findUnique.mockResolvedValue(performanceRow({ rpe: 8 }));
      prisma.performance.update.mockResolvedValue(performanceRow({ rpe: 6, notes: 'corrigé' }));

      await service(prisma).updatePerformance(ATHLETE, 'asg-1', {
        ...DTO,
        rpe: 6,
        notes: 'corrigé',
      });

      expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
      const arg = prisma.auditLog.create.mock.calls[0][0];
      expect(arg.data).toMatchObject({
        actorId: 'a-1',
        action: 'performance.correction',
        entityType: 'performance',
        entityId: 'perf-1',
      });
      expect(arg.data.metadata.before).toMatchObject({ rpe: 8, notes: 'ok' });
      expect(arg.data.metadata.after).toMatchObject({ rpe: 6, notes: 'corrigé' });
    });

    it('un PUT identique ne laisse pas de trace vide', async () => {
      const prisma = prismaMock();
      prisma.sessionAssignment.findFirst.mockResolvedValue(assignmentRow());
      prisma.performance.findUnique.mockResolvedValue(performanceRow());
      // L'update renvoie une perf identique (mêmes results/rpe/notes).
      prisma.performance.update.mockResolvedValue(performanceRow());

      await service(prisma).updatePerformance(ATHLETE, 'asg-1', DTO);

      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });
  });
});
