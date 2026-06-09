import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { OwnershipService } from '../common/authorization/ownership.service';
import type { ConsentGate } from '../common/authorization/consent.gate';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
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
  $transaction: jest.Mock;
};

function prismaMock(): PrismaMock {
  const mock: PrismaMock = {
    sessionAssignment: { findFirst: jest.fn(), update: jest.fn() },
    performance: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    $transaction: jest.fn((arg: unknown) =>
      Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(mock),
    ),
  };
  return mock;
}

function service(
  prisma: PrismaMock,
  ownership = ownershipMock(),
  consent = consentMock(),
): PerformancesService {
  return new PerformancesService(prisma as unknown as PrismaService, ownership, consent);
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
  });
});
