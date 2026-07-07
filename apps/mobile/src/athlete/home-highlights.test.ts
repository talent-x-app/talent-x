import type { Assignment, Notification, PersonalRecord } from '@talent-x/api-client';
import { latestCoachFeedback, latestRecord, monthCompletion } from './home-highlights';

/** Tests des dérivations pures de l'accueil (TLX-148). */

function record(id: string, achievedAt: string): PersonalRecord {
  return {
    id,
    athleteId: 'u-1',
    eventKey: 'sprint:100',
    label: '100 m',
    value: 11.2,
    unit: 's',
    direction: 'min',
    achievedAt,
  } as PersonalRecord;
}

function assignment(status: string, dueDate?: string): Assignment {
  return { id: 'a', athleteId: 'u-1', status, dueDate } as unknown as Assignment;
}

function notif(id: string, type: string, createdAt: string): Notification {
  return { id, type, resourceId: 'r-1', createdAt } as Notification;
}

const NOW = new Date('2026-07-07T12:00:00Z');

describe('latestRecord', () => {
  it('renvoie le record le plus récent par achievedAt', () => {
    const r = latestRecord([
      record('old', '2026-05-01T00:00:00Z'),
      record('new', '2026-06-20T00:00:00Z'),
      record('mid', '2026-06-01T00:00:00Z'),
    ]);
    expect(r?.id).toBe('new');
  });

  it('renvoie null sans record', () => {
    expect(latestRecord([])).toBeNull();
  });
});

describe('monthCompletion', () => {
  it('compte réalisées / échues du mois calendaire courant', () => {
    const result = monthCompletion(
      [
        assignment('completed', '2026-07-02T00:00:00Z'),
        assignment('skipped', '2026-07-03T00:00:00Z'),
        assignment('assigned', '2026-07-05T00:00:00Z'), // échue non réalisée
      ],
      NOW,
    );
    expect(result).toEqual({ completed: 1, total: 3 });
  });

  it('exclut les séances futures du mois non réalisées, garde les futures déjà réalisées', () => {
    const result = monthCompletion(
      [
        assignment('assigned', '2026-07-20T00:00:00Z'), // future, pas encore due
        assignment('completed', '2026-07-20T00:00:00Z'), // future mais déjà faite
      ],
      NOW,
    );
    expect(result).toEqual({ completed: 1, total: 1 });
  });

  it('ignore les autres mois et renvoie null sans séance à compter', () => {
    expect(
      monthCompletion(
        [assignment('completed', '2026-06-30T00:00:00Z'), assignment('completed')],
        NOW,
      ),
    ).toBeNull();
    expect(monthCompletion([], NOW)).toBeNull();
  });
});

describe('latestCoachFeedback', () => {
  it('renvoie la notification performance_feedback la plus récente', () => {
    const n = latestCoachFeedback([
      notif('n1', 'session_assigned', '2026-07-06T00:00:00Z'),
      notif('n2', 'performance_feedback', '2026-07-01T00:00:00Z'),
      notif('n3', 'performance_feedback', '2026-07-04T00:00:00Z'),
    ]);
    expect(n?.id).toBe('n3');
  });

  it('renvoie null sans feedback dans le feed', () => {
    expect(latestCoachFeedback([notif('n1', 'group_update', '2026-07-06T00:00:00Z')])).toBeNull();
    expect(latestCoachFeedback([])).toBeNull();
  });
});
