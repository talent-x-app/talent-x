import type { Assignment, Competition, Session } from '@talent-x/api-client';
import {
  addDays,
  assignmentToCalendarEntry,
  type CalendarEntry,
  assignedCountBySession,
  coachSessionBuckets,
  coachSessionEntries,
  competitionToCalendarEntry,
  dayKey,
  earliestDueDateBySession,
  overdueSessionIds,
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

const competition = (over: Partial<Competition> = {}): Competition => ({
  id: 'k-1',
  coachId: 'c-1',
  name: 'Meeting de printemps',
  startDate: '2026-07-01',
  status: 'published',
  ...over,
});

const entry = (over: Partial<CalendarEntry> = {}): CalendarEntry => ({
  id: 'e-1',
  kind: 'assignment',
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

  it('mappe un brouillon (tonalité neutre, isDraft) — TLX-195', () => {
    const e = sessionToCalendarEntry(session({ status: 'draft', scheduledDate: '2026-05-13' }));
    expect(e).toMatchObject({ tone: 'neutral', statusLabel: 'Brouillon', isDraft: true });
    expect(sessionToCalendarEntry(session({ status: 'published' })).isDraft).toBe(false);
  });

  it("date null si la séance n'est pas planifiée", () => {
    expect(sessionToCalendarEntry(session({ scheduledDate: undefined })).date).toBeNull();
  });

  it('TLX-195 : repli sur l’échéance d’affectation quand la séance est non datée', () => {
    const e = sessionToCalendarEntry(session({ scheduledDate: undefined }), '2026-05-20');
    expect(e.date).toBe('2026-05-20');
  });

  it('TLX-195 : la date planifiée prime sur le repli d’échéance', () => {
    const e = sessionToCalendarEntry(session({ scheduledDate: '2026-05-13' }), '2026-05-20');
    expect(e.date).toBe('2026-05-13');
  });
});

describe('overdueSessionIds (TLX-195 calendrier)', () => {
  const NOW = new Date('2026-06-15T00:00:00Z');
  it('marque une échéance passée non soldée', () => {
    const set = overdueSessionIds(
      [assignment({ sessionId: 's-late', dueDate: '2026-06-01', status: 'assigned' })],
      NOW,
    );
    expect(set.has('s-late')).toBe(true);
  });
  it('ignore les échéances réalisées, passées volontairement, ou futures', () => {
    const set = overdueSessionIds(
      [
        assignment({ sessionId: 's-done', dueDate: '2026-06-01', status: 'completed' }),
        assignment({ sessionId: 's-skip', dueDate: '2026-06-01', status: 'skipped' }),
        assignment({ sessionId: 's-future', dueDate: '2026-07-01', status: 'assigned' }),
      ],
      NOW,
    );
    expect(set.has('s-done')).toBe(false);
    expect(set.has('s-skip')).toBe(false);
    expect(set.has('s-future')).toBe(false);
  });
});

describe('coachSessionEntries (TLX-195)', () => {
  const NOW = new Date('2026-06-15T00:00:00Z');
  it('exclut les modèles, date effective via échéance, marque le retard', () => {
    const entries = coachSessionEntries(
      [
        session({ id: 's-occ', scheduledDate: undefined }),
        session({ id: 't-1', status: 'template' }),
      ],
      [assignment({ sessionId: 's-occ', dueDate: '2026-06-01', status: 'assigned' })],
      NOW,
    );
    expect(entries).toHaveLength(1); // modèle exclu
    expect(entries[0]).toMatchObject({ id: 's-occ', date: '2026-06-01', overdue: true });
  });
});

describe('coachSessionBuckets (ADR-53)', () => {
  const NOW = new Date('2026-06-15T00:00:00Z');
  it('répartit en À venir / Passées / Brouillons / Modèles (non datées en tête d’À venir)', () => {
    const sessions = [
      session({ id: 's-future', status: 'published', scheduledDate: '2026-06-20' }),
      session({ id: 's-past', status: 'published', scheduledDate: '2026-06-01' }),
      session({ id: 's-undated', status: 'published', scheduledDate: undefined }),
      session({ id: 's-draft', status: 'draft' }),
      session({ id: 't-1', status: 'template' }),
    ];
    const b = coachSessionBuckets(sessions, [], NOW);
    expect(b.upcoming.map((e) => e.id)).toEqual(['s-undated', 's-future']);
    expect(b.past.map((e) => e.id)).toEqual(['s-past']);
    expect(b.drafts.map((e) => e.id)).toEqual(['s-draft']);
    expect(b.templates.map((e) => e.id)).toEqual(['t-1']);
  });

  /**
   * TLX-256 — l'app savait **étiqueter** `archived` (`SESSION_STATUS_META`) sans pouvoir le
   * produire ni le lister : `archiveSession` n'avait aucun appelant, et aucun filtre ne montrait
   * ce qui aurait été archivé. Le seau manquant est la moitié qui donne son sens à l'action —
   * archiver sans pouvoir relire est une suppression déguisée.
   */
  it('les séances archivées ont leur seau, et quittent les autres filtres', () => {
    const sessions = [
      session({ id: 's-future', status: 'published', scheduledDate: '2026-06-20' }),
      // Datée dans le futur : sans exclusion, elle resterait dans « À venir » et archiver
      // n'aurait rien rangé du tout.
      session({ id: 's-archived', status: 'archived', scheduledDate: '2026-06-20' }),
      session({ id: 's-archived-past', status: 'archived', scheduledDate: '2026-06-01' }),
    ];

    const b = coachSessionBuckets(sessions, [], NOW);

    expect(b.archived.map((e) => e.id).sort()).toEqual(['s-archived', 's-archived-past']);
    expect(b.upcoming.map((e) => e.id)).toEqual(['s-future']);
    expect(b.past).toEqual([]);
  });
});

describe('assignedCountBySession (ADR-53 lot 2)', () => {
  it('compte les athlètes distincts par séance', () => {
    const map = assignedCountBySession([
      assignment({ id: 'a1', sessionId: 's-1', athleteId: 'ath-1' }),
      assignment({ id: 'a2', sessionId: 's-1', athleteId: 'ath-2' }),
      assignment({ id: 'a3', sessionId: 's-1', athleteId: 'ath-1' }), // doublon athlète
      assignment({ id: 'a4', sessionId: 's-2', athleteId: 'ath-9' }),
    ]);
    expect(map.get('s-1')).toBe(2);
    expect(map.get('s-2')).toBe(1);
  });
});

describe('earliestDueDateBySession (TLX-195)', () => {
  it('retient l’échéance la plus précoce par séance', () => {
    const map = earliestDueDateBySession([
      assignment({ id: 'a1', sessionId: 's-occ', dueDate: '2026-05-20' }),
      assignment({ id: 'a2', sessionId: 's-occ', dueDate: '2026-05-13' }),
      assignment({ id: 'a3', sessionId: 's-other', dueDate: '2026-06-01' }),
    ]);
    expect(map.get('s-occ')).toBe('2026-05-13');
    expect(map.get('s-other')).toBe('2026-06-01');
  });

  it('ignore les affectations sans échéance', () => {
    const map = earliestDueDateBySession([assignment({ sessionId: 's-x', dueDate: undefined })]);
    expect(map.has('s-x')).toBe(false);
  });
});

describe('competitionToCalendarEntry (ADR-24 §5)', () => {
  it('mappe une compétition publiée (date de début, libellé « Compétition »)', () => {
    const e = competitionToCalendarEntry(competition({ startDate: '2026-07-01' }));
    expect(e).toMatchObject({
      id: 'k-1',
      kind: 'competition',
      title: 'Meeting de printemps',
      date: '2026-07-01',
      tone: 'accent',
      statusLabel: 'Compétition · Publiée',
    });
  });

  it('mappe une compétition annulée (tonalité danger)', () => {
    const e = competitionToCalendarEntry(competition({ status: 'cancelled' }));
    expect(e).toMatchObject({ tone: 'danger', statusLabel: 'Compétition · Annulée' });
  });

  it('titre de repli si le nom est vide', () => {
    expect(competitionToCalendarEntry(competition({ name: '   ' })).title).toBe('Compétition');
  });

  it('normalise un instant ISO complet en jour calendaire', () => {
    const e = competitionToCalendarEntry(competition({ startDate: '2026-07-01T00:00:00.000Z' }));
    expect(e.date).toBe('2026-07-01');
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
