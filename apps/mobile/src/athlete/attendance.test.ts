import { AssignmentStatus, type Assignment } from '@talent-x/api-client';
import { computeAttendance, hasAttendanceSignal, isEvaluable, weekKey } from './attendance';

/** Fabrique une affectation minimale (date = échéance, sinon date planifiée de la séance). */
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

// 2026-06-13 est un samedi → semaine du lundi 2026-06-08.
const NOW = new Date('2026-06-13T09:00:00Z');

describe('attendance (TLX-115)', () => {
  describe('weekKey', () => {
    it('renvoie le lundi UTC de la semaine', () => {
      expect(weekKey(new Date('2026-06-13T09:00:00Z'))).toBe('2026-06-08'); // samedi
      expect(weekKey(new Date('2026-06-08T00:00:00Z'))).toBe('2026-06-08'); // lundi
      expect(weekKey(new Date('2026-06-14T23:59:59Z'))).toBe('2026-06-08'); // dimanche
      expect(weekKey(new Date('2026-06-15T00:00:00Z'))).toBe('2026-06-15'); // lundi suivant
    });
  });

  describe('isEvaluable', () => {
    it('exclut les skipped', () => {
      expect(
        isEvaluable(make('s', AssignmentStatus.skipped, { dueDate: '2026-06-10T00:00:00Z' }), NOW),
      ).toBe(false);
    });

    it('exclut les affectations sans date', () => {
      expect(isEvaluable(make('u', AssignmentStatus.completed), NOW)).toBe(false);
    });

    it('inclut une affectation réalisée même datée dans le futur', () => {
      expect(
        isEvaluable(
          make('c', AssignmentStatus.completed, { dueDate: '2026-06-20T00:00:00Z' }),
          NOW,
        ),
      ).toBe(true);
    });

    it('inclut une affectation à faire échue, exclut une à faire future', () => {
      expect(
        isEvaluable(
          make('due', AssignmentStatus.assigned, { dueDate: '2026-06-13T22:00:00Z' }),
          NOW,
        ),
      ).toBe(true); // aujourd'hui (même jour UTC)
      expect(
        isEvaluable(
          make('fut', AssignmentStatus.assigned, { dueDate: '2026-06-14T00:00:00Z' }),
          NOW,
        ),
      ).toBe(false); // demain
    });
  });

  describe('computeAttendance — taux du mois', () => {
    it('réalisées / évaluables du mois courant, skipped et futures exclues', () => {
      const list = [
        make('a', AssignmentStatus.completed, { dueDate: '2026-06-02T00:00:00Z' }),
        make('b', AssignmentStatus.completed, { dueDate: '2026-06-09T00:00:00Z' }),
        make('c', AssignmentStatus.assigned, { dueDate: '2026-06-10T00:00:00Z' }), // échue, non faite
        make('d', AssignmentStatus.skipped, { dueDate: '2026-06-11T00:00:00Z' }), // exclue
        make('e', AssignmentStatus.assigned, { dueDate: '2026-06-30T00:00:00Z' }), // future, exclue
        make('f', AssignmentStatus.completed, { dueDate: '2026-05-30T00:00:00Z' }), // autre mois
      ];
      const r = computeAttendance(list, NOW);
      expect(r.monthCompleted).toBe(2);
      expect(r.monthTotal).toBe(3);
      expect(r.monthCompletionRate).toBeCloseTo(2 / 3);
    });

    it('renvoie tout à zéro sans aucune donnée évaluable', () => {
      const list = [make('fut', AssignmentStatus.assigned, { dueDate: '2026-07-01T00:00:00Z' })];
      expect(computeAttendance(list, NOW)).toEqual({
        currentStreakWeeks: 0,
        bestStreakWeeks: 0,
        monthCompleted: 0,
        monthTotal: 0,
        monthCompletionRate: 0,
      });
    });
  });

  describe('computeAttendance — séries', () => {
    it('compte les semaines actives consécutives entièrement réalisées', () => {
      // 3 semaines pleines : 25 mai, 1 juin, 8 juin (en cours).
      const list = [
        make('w1a', AssignmentStatus.completed, { dueDate: '2026-05-26T00:00:00Z' }),
        make('w1b', AssignmentStatus.completed, { dueDate: '2026-05-28T00:00:00Z' }),
        make('w2', AssignmentStatus.completed, { dueDate: '2026-06-02T00:00:00Z' }),
        make('w3', AssignmentStatus.completed, { dueDate: '2026-06-09T00:00:00Z' }),
      ];
      const r = computeAttendance(list, NOW);
      expect(r.currentStreakWeeks).toBe(3);
      expect(r.bestStreakWeeks).toBe(3);
    });

    it('rompt la série courante si la semaine la plus récente est incomplète', () => {
      const list = [
        make('w1', AssignmentStatus.completed, { dueDate: '2026-06-01T00:00:00Z' }),
        make('w2done', AssignmentStatus.completed, { dueDate: '2026-06-09T00:00:00Z' }),
        make('w2todo', AssignmentStatus.assigned, { dueDate: '2026-06-10T00:00:00Z' }), // échue non faite
      ];
      const r = computeAttendance(list, NOW);
      expect(r.currentStreakWeeks).toBe(0); // semaine courante incomplète
      expect(r.bestStreakWeeks).toBe(1); // la semaine du 1er juin reste un record
    });

    it('saute les semaines sans activité (non pénalisantes)', () => {
      // Semaine pleine, puis trou (rien programmé), puis semaine pleine en cours → série = 2.
      const list = [
        make('old', AssignmentStatus.completed, { dueDate: '2026-05-26T00:00:00Z' }),
        make('now', AssignmentStatus.completed, { dueDate: '2026-06-09T00:00:00Z' }),
      ];
      const r = computeAttendance(list, NOW);
      expect(r.currentStreakWeeks).toBe(2);
      expect(r.bestStreakWeeks).toBe(2);
    });

    it('best > courant quand une vieille série est plus longue', () => {
      const list = [
        make('a1', AssignmentStatus.completed, { dueDate: '2026-05-04T00:00:00Z' }),
        make('a2', AssignmentStatus.completed, { dueDate: '2026-05-11T00:00:00Z' }),
        make('a3', AssignmentStatus.completed, { dueDate: '2026-05-18T00:00:00Z' }),
        make('break', AssignmentStatus.assigned, { dueDate: '2026-05-25T00:00:00Z' }), // semaine ratée
        make('recent', AssignmentStatus.completed, { dueDate: '2026-06-09T00:00:00Z' }),
      ];
      const r = computeAttendance(list, NOW);
      expect(r.currentStreakWeeks).toBe(1);
      expect(r.bestStreakWeeks).toBe(3);
    });
  });

  describe('hasAttendanceSignal', () => {
    it('vrai dès une affectation évaluable, faux sinon', () => {
      expect(
        hasAttendanceSignal(
          [make('c', AssignmentStatus.completed, { dueDate: '2026-06-09T00:00:00Z' })],
          NOW,
        ),
      ).toBe(true);
      expect(
        hasAttendanceSignal(
          [make('fut', AssignmentStatus.assigned, { dueDate: '2026-07-01T00:00:00Z' })],
          NOW,
        ),
      ).toBe(false);
      expect(hasAttendanceSignal([], NOW)).toBe(false);
    });
  });
});
