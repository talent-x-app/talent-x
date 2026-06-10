import { AssignmentStatus, type Assignment } from '@talent-x/api-client';
import { assignmentDate, countDueToday, isDueToday, selectPendingAssignments } from './home-model';

/** Fabrique une affectation minimale pour les tests de sélection. */
function make(
  id: string,
  status: AssignmentStatus,
  opts: { dueDate?: string; scheduledDate?: string } = {},
): Assignment {
  return {
    id,
    status,
    dueDate: opts.dueDate,
    athleteId: 'a-1',
    session: opts.scheduledDate ? { scheduledDate: opts.scheduledDate } : undefined,
  } as unknown as Assignment;
}

describe('home-model (A-01, TLX-089)', () => {
  describe('selectPendingAssignments', () => {
    it('ne garde que les affectations à faire (assigned/in_progress)', () => {
      const list = [
        make('done', AssignmentStatus.completed, { dueDate: '2026-06-11T00:00:00Z' }),
        make('skip', AssignmentStatus.skipped, { dueDate: '2026-06-11T00:00:00Z' }),
        make('todo', AssignmentStatus.assigned, { dueDate: '2026-06-12T00:00:00Z' }),
        make('wip', AssignmentStatus.in_progress, { dueDate: '2026-06-13T00:00:00Z' }),
      ];
      expect(selectPendingAssignments(list).map((a) => a.id)).toEqual(['todo', 'wip']);
    });

    it('trie par échéance la plus proche d’abord, sans-date en dernier', () => {
      const list = [
        make('late', AssignmentStatus.assigned, { dueDate: '2026-06-20T00:00:00Z' }),
        make('undated', AssignmentStatus.assigned),
        make('soon', AssignmentStatus.assigned, { dueDate: '2026-06-11T00:00:00Z' }),
      ];
      expect(selectPendingAssignments(list).map((a) => a.id)).toEqual(['soon', 'late', 'undated']);
    });

    it('utilise la date planifiée de la séance à défaut d’échéance', () => {
      const list = [
        make('a', AssignmentStatus.assigned, { scheduledDate: '2026-06-15T00:00:00Z' }),
        make('b', AssignmentStatus.assigned, { dueDate: '2026-06-10T00:00:00Z' }),
      ];
      expect(selectPendingAssignments(list).map((a) => a.id)).toEqual(['b', 'a']);
    });
  });

  describe('assignmentDate', () => {
    it('préfère l’échéance, retombe sur la date planifiée, sinon undefined', () => {
      expect(
        assignmentDate(make('a', AssignmentStatus.assigned, { dueDate: 'D', scheduledDate: 'S' })),
      ).toBe('D');
      expect(assignmentDate(make('b', AssignmentStatus.assigned, { scheduledDate: 'S' }))).toBe(
        'S',
      );
      expect(assignmentDate(make('c', AssignmentStatus.assigned))).toBeUndefined();
    });
  });

  describe('isDueToday / countDueToday', () => {
    const now = new Date('2026-06-11T09:00:00Z');

    it('détecte l’échéance du jour en UTC', () => {
      expect(
        isDueToday(make('a', AssignmentStatus.assigned, { dueDate: '2026-06-11T22:00:00Z' }), now),
      ).toBe(true);
      expect(
        isDueToday(make('b', AssignmentStatus.assigned, { dueDate: '2026-06-12T00:00:00Z' }), now),
      ).toBe(false);
      expect(isDueToday(make('c', AssignmentStatus.assigned), now)).toBe(false);
    });

    it('compte uniquement les affectations à faire dont l’échéance est aujourd’hui', () => {
      const list = [
        make('today-todo', AssignmentStatus.assigned, { dueDate: '2026-06-11T10:00:00Z' }),
        make('today-done', AssignmentStatus.completed, { dueDate: '2026-06-11T10:00:00Z' }),
        make('tomorrow-todo', AssignmentStatus.assigned, { dueDate: '2026-06-12T10:00:00Z' }),
      ];
      expect(countDueToday(list, now)).toBe(1);
    });
  });
});
