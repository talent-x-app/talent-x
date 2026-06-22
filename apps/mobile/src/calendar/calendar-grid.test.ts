import {
  assignmentDate,
  assignmentDayKey,
  buildMonthGrid,
  buildWeek,
  dayKeyOf,
  formatMonthLabel,
  formatWeekRange,
  groupByDay,
  isoDayKey,
} from './calendar-grid';
import type { Assignment } from '@talent-x/api-client';

function asg(id: string, dueDate?: string, scheduledDate?: string): Assignment {
  return {
    id,
    sessionId: `s-${id}`,
    athleteId: 'a',
    status: 'assigned',
    dueDate,
    session: scheduledDate ? ({ scheduledDate } as Assignment['session']) : undefined,
  } as Assignment;
}

describe('clés de date', () => {
  it('isoDayKey garde la partie date d’une ISO', () => {
    expect(isoDayKey('2026-06-21T18:00:00.000Z')).toBe('2026-06-21');
    expect(isoDayKey('2026-06-21')).toBe('2026-06-21');
  });

  it('assignmentDate prend dueDate puis scheduledDate', () => {
    expect(assignmentDate(asg('1', '2026-06-21'))).toBe('2026-06-21');
    expect(assignmentDate(asg('2', undefined, '2026-06-10'))).toBe('2026-06-10');
    expect(assignmentDate(asg('3'))).toBeUndefined();
  });

  it('dayKeyOf formate une Date locale', () => {
    expect(dayKeyOf(new Date(2026, 5, 7))).toBe('2026-06-07');
  });
});

describe('groupByDay', () => {
  it('indexe par clé de jour et ignore le non daté', () => {
    const map = groupByDay([asg('a', '2026-06-21'), asg('b', '2026-06-21'), asg('c')]);
    expect(map.get('2026-06-21')?.map((a) => a.id)).toEqual(['a', 'b']);
    expect(map.size).toBe(1);
  });
});

describe('assignmentDayKey', () => {
  it('renvoie la clé ou undefined', () => {
    expect(assignmentDayKey(asg('a', '2026-06-21T10:00:00Z'))).toBe('2026-06-21');
    expect(assignmentDayKey(asg('b'))).toBeUndefined();
  });
});

describe('grille calendrier', () => {
  it('buildMonthGrid : semaines lundi→dimanche, 1er jour positionné', () => {
    const weeks = buildMonthGrid(2026, 5); // juin 2026 : le 1er est un lundi
    expect(weeks[0][0]).toMatchObject({ day: 1, inMonth: true });
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    // Le 30 juin (dernier jour) doit être présent et inMonth.
    const flat = weeks.flat();
    const last = flat.find((c) => c.key === '2026-06-30');
    expect(last?.inMonth).toBe(true);
    // Les débordements sont estompés (inMonth false).
    expect(flat.some((c) => !c.inMonth)).toBe(true);
  });

  it('buildWeek : 7 jours autour d’une date, lundi en tête', () => {
    const week = buildWeek(new Date(2026, 5, 17)); // mercredi 17 juin
    expect(week).toHaveLength(7);
    expect(week[0].key).toBe('2026-06-15'); // lundi
    expect(week[6].key).toBe('2026-06-21'); // dimanche
  });
});

describe('libellés', () => {
  it('formatMonthLabel capitalise', () => {
    expect(formatMonthLabel(2026, 5)).toBe('Juin 2026');
  });

  it('formatWeekRange même mois', () => {
    expect(formatWeekRange(buildWeek(new Date(2026, 5, 17)))).toMatch(/15 – 21/);
  });
});
