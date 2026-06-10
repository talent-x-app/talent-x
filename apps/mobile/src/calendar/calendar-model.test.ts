import type { Assignment, Session } from '@talent-x/api-client';
import {
  addDays,
  assignmentToCalendarEntry,
  type CalendarEntry,
  dayKey,
  formatDayLabel,
  formatWeekLabel,
  groupEntriesByDay,
  isSameDay,
  sessionToCalendarEntry,
  startOfWeek,
  undatedEntries,
  weekDays,
  weekHasEntries,
  weekView,
} from './calendar-model';

const session = (over: Partial<Session> = {}): Session => ({
  id: 's-1',
  title: 'Sprint 60m',
  status: 'published',
  coachId: 'c-1',
  exercises: { items: [] },
  ...over,
});

const assignment = (over: Partial<Assignment> = {}): Assignment => ({
  id: 'as-1',
  sessionId: 's-1',
  athleteId: 'me',
  status: 'assigned',
  session: session(),
  ...over,
});

const entry = (over: Partial<CalendarEntry> = {}): CalendarEntry => ({
  id: 'e-1',
  title: 'Séance',
  date: '2026-05-12',
  tone: 'accent',
  statusLabel: 'À faire',
  ...over,
});

describe('startOfWeek (lundi UTC)', () => {
  it('renvoie le lundi pour un jour en milieu de semaine', () => {
    // 2026-05-14 est un jeudi → lundi = 2026-05-11.
    expect(dayKey(startOfWeek(new Date('2026-05-14T09:00:00Z')))).toBe('2026-05-11');
  });

  it('traite dimanche comme la fin de la semaine (pas le début)', () => {
    // 2026-05-17 est un dimanche → lundi de cette semaine = 2026-05-11.
    expect(dayKey(startOfWeek(new Date('2026-05-17T23:00:00Z')))).toBe('2026-05-11');
  });

  it('renvoie le lundi lui-même pour un lundi', () => {
    expect(dayKey(startOfWeek(new Date('2026-05-11T00:00:00Z')))).toBe('2026-05-11');
  });
});

describe('weekDays / addDays', () => {
  it('produit 7 jours consécutifs lundi → dimanche', () => {
    const days = weekDays(startOfWeek(new Date('2026-05-14T00:00:00Z')));
    expect(days).toHaveLength(7);
    expect(days.map(dayKey)).toEqual([
      '2026-05-11',
      '2026-05-12',
      '2026-05-13',
      '2026-05-14',
      '2026-05-15',
      '2026-05-16',
      '2026-05-17',
    ]);
  });

  it('addDays ne mute pas son argument', () => {
    const base = new Date('2026-05-11T00:00:00Z');
    addDays(base, 5);
    expect(dayKey(base)).toBe('2026-05-11');
  });

  it('addDays franchit correctement une fin de mois', () => {
    expect(dayKey(addDays(new Date('2026-05-30T00:00:00Z'), 3))).toBe('2026-06-02');
  });
});

describe('assignmentToCalendarEntry (A-08)', () => {
  it("prend l'échéance comme date et le statut comme tonalité/libellé", () => {
    const e = assignmentToCalendarEntry(assignment({ status: 'completed', dueDate: '2026-05-12' }));
    expect(e).toMatchObject({
      id: 'as-1',
      title: 'Sprint 60m',
      date: '2026-05-12',
      tone: 'success',
      statusLabel: 'Réalisée',
    });
  });

  it("retombe sur la date planifiée de la séance si pas d'échéance", () => {
    const e = assignmentToCalendarEntry(
      assignment({ dueDate: undefined, session: session({ scheduledDate: '2026-05-20' }) }),
    );
    expect(e.date).toBe('2026-05-20');
  });

  it('date null si ni échéance ni date planifiée', () => {
    const e = assignmentToCalendarEntry(
      assignment({ dueDate: undefined, session: session({ scheduledDate: undefined }) }),
    );
    expect(e.date).toBeNull();
  });

  it('normalise un instant ISO complet en jour calendaire', () => {
    const e = assignmentToCalendarEntry(assignment({ dueDate: '2026-05-12T00:00:00.000Z' }));
    expect(e.date).toBe('2026-05-12');
  });

  it('titre de repli « Séance » si la séance est absente', () => {
    const e = assignmentToCalendarEntry(assignment({ session: undefined }));
    expect(e.title).toBe('Séance');
  });
});

describe('sessionToCalendarEntry (C-09)', () => {
  it('mappe une séance publiée (date planifiée, tonalité accent)', () => {
    const e = sessionToCalendarEntry(session({ scheduledDate: '2026-05-13' }));
    expect(e).toMatchObject({
      id: 's-1',
      date: '2026-05-13',
      tone: 'accent',
      statusLabel: 'Publiée',
    });
  });

  it('mappe un brouillon (tonalité neutre)', () => {
    const e = sessionToCalendarEntry(session({ status: 'draft', scheduledDate: '2026-05-13' }));
    expect(e).toMatchObject({ tone: 'neutral', statusLabel: 'Brouillon' });
  });

  it("date null si la séance n'est pas planifiée", () => {
    expect(sessionToCalendarEntry(session({ scheduledDate: undefined })).date).toBeNull();
  });
});

describe('groupEntriesByDay / weekView / undated', () => {
  it('regroupe par jour et exclut les entrées sans date', () => {
    const grouped = groupEntriesByDay([
      entry({ id: 'a', date: '2026-05-12' }),
      entry({ id: 'b', date: '2026-05-12' }),
      entry({ id: 'c', date: '2026-05-13' }),
      entry({ id: 'd', date: null }),
    ]);
    expect(grouped.get('2026-05-12')?.map((e) => e.id)).toEqual(['a', 'b']);
    expect(grouped.get('2026-05-13')?.map((e) => e.id)).toEqual(['c']);
    expect(grouped.has('null')).toBe(false);
  });

  it('weekView aligne les entrées sur les bons jours, « Repos » ailleurs', () => {
    const days = weekView(
      [entry({ id: 'a', date: '2026-05-12' }), entry({ id: 'c', date: '2026-05-13' })],
      startOfWeek(new Date('2026-05-14T00:00:00Z')),
    );
    const map = Object.fromEntries(days.map((d) => [d.key, d.entries.length]));
    expect(map['2026-05-12']).toBe(1);
    expect(map['2026-05-13']).toBe(1);
    expect(map['2026-05-11']).toBe(0);
    expect(weekHasEntries(days)).toBe(true);
  });

  it('weekHasEntries false sur une semaine sans entrée', () => {
    const days = weekView(
      [entry({ date: '2026-05-12' })],
      startOfWeek(new Date('2026-06-01T00:00:00Z')),
    );
    expect(weekHasEntries(days)).toBe(false);
  });

  it('undatedEntries ne retient que les entrées sans date', () => {
    expect(
      undatedEntries([entry({ id: 'a', date: '2026-05-12' }), entry({ id: 'b', date: null })]).map(
        (e) => e.id,
      ),
    ).toEqual(['b']);
  });
});

describe('isSameDay / formatage (UTC, déterministe)', () => {
  it('isSameDay compare le jour calendaire', () => {
    expect(isSameDay(new Date('2026-05-12T01:00:00Z'), new Date('2026-05-12T22:00:00Z'))).toBe(
      true,
    );
    expect(isSameDay(new Date('2026-05-12T00:00:00Z'), new Date('2026-05-13T00:00:00Z'))).toBe(
      false,
    );
  });

  it('formatWeekLabel « Semaine du … »', () => {
    expect(formatWeekLabel(new Date('2026-05-11T00:00:00Z'))).toBe('Semaine du 11 mai');
  });

  it('formatDayLabel jour court + numéro', () => {
    // 2026-05-12 est un mardi.
    expect(formatDayLabel(new Date('2026-05-12T00:00:00Z'))).toContain('12');
  });
});
