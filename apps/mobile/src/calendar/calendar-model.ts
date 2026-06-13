import {
  CompetitionStatus,
  SessionStatus,
  type Assignment,
  type Competition,
  type Session,
} from '@talent-x/api-client';
import { ASSIGNMENT_STATUS_META } from '../athlete/athlete-session-ui';

/**
 * Modèle de calendrier (TLX-100 — A-08 athlète / C-09 coach). Le calendrier est une **vue
 * dérivée** des données existantes, sans endpoint ni contrat dédiés :
 *  - **athlète** : `GET /assignments` (séances affectées) regroupées par date d'échéance
 *    (à défaut date planifiée de la séance) ;
 *  - **coach** : `GET /sessions` (ses séances) regroupées par date planifiée.
 *
 * Toutes les dates manipulées ici sont **calendaires** (jour, sans heure). Les bornes de jour
 * et le regroupement se font en **UTC**, cohérent avec les dates `dueDate`/`scheduledDate`
 * (sérialisées en `YYYY-MM-DD`) et avec la borne de jour du backend (`CoachInsightsService`).
 */

export type CalendarTone = 'success' | 'warning' | 'danger' | 'neutral' | 'accent';

/** Nature de l'entrée : détermine la route de navigation chez le parent (ADR-24 §5). */
export type CalendarEntryKind = 'session' | 'assignment' | 'competition';

/** Entrée de calendrier dérivée (séance/affectation ou compétition — ADR-24). */
export interface CalendarEntry {
  /**
   * Identifiant de la ressource navigable selon `kind` : affectation (athlète),
   * séance (coach), ou compétition (les deux rôles).
   */
  id: string;
  /** Type de ressource sous-jacente → route de destination résolue par le parent. */
  kind: CalendarEntryKind;
  title: string;
  /** Jour calendaire `YYYY-MM-DD`, ou `null` si non planifiée. */
  date: string | null;
  tone: CalendarTone;
  statusLabel: string;
}

/** Libellé + tonalité par statut de séance (coach C-09). */
export const SESSION_STATUS_META: Record<SessionStatus, { label: string; tone: CalendarTone }> = {
  [SessionStatus.draft]: { label: 'Brouillon', tone: 'neutral' },
  [SessionStatus.published]: { label: 'Publiée', tone: 'accent' },
  [SessionStatus.archived]: { label: 'Archivée', tone: 'neutral' },
  // Les modèles (C-10, ADR-29) sont filtrés en amont du calendrier ; entrée présente pour la
  // complétude du type (un modèle n'apparaît jamais comme entrée planifiée).
  [SessionStatus.template]: { label: 'Modèle', tone: 'neutral' },
  // Séance libre athlète (TLX-111, ADR-36) : appartient à l'athlète (coach_id = athlète) ;
  // n'apparaît pas dans le calendrier coach. Entrée présente pour la complétude du type.
  [SessionStatus.self_logged]: { label: 'Séance libre', tone: 'neutral' },
};

/** Libellé + tonalité par statut de compétition (ADR-24). */
export const COMPETITION_STATUS_META: Record<
  CompetitionStatus,
  { label: string; tone: CalendarTone }
> = {
  [CompetitionStatus.draft]: { label: 'Brouillon', tone: 'neutral' },
  [CompetitionStatus.published]: { label: 'Publiée', tone: 'accent' },
  [CompetitionStatus.cancelled]: { label: 'Annulée', tone: 'danger' },
};

/**
 * Normalise une date d'API en clé jour `YYYY-MM-DD` (UTC). Accepte une date déjà calendaire
 * ou un instant ISO complet ; renvoie `null` si vide ou invalide (lecture défensive).
 */
function normalizeDate(value: string | undefined | null): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : dayKey(d);
}

/** Affectation → entrée (A-08). Date = échéance, à défaut date planifiée de la séance. */
export function assignmentToCalendarEntry(a: Assignment): CalendarEntry {
  const meta = ASSIGNMENT_STATUS_META[a.status];
  const title = a.session?.title?.trim();
  return {
    id: a.id,
    kind: 'assignment',
    title: title && title.length > 0 ? title : 'Séance',
    date: normalizeDate(a.dueDate ?? a.session?.scheduledDate),
    tone: toneFromAssignment(meta.tone),
    statusLabel: meta.label,
  };
}

/** Séance → entrée (C-09). Date = date planifiée de la séance. */
export function sessionToCalendarEntry(s: Session): CalendarEntry {
  const meta = SESSION_STATUS_META[s.status];
  const title = s.title?.trim();
  return {
    id: s.id,
    kind: 'session',
    title: title && title.length > 0 ? title : 'Séance',
    date: normalizeDate(s.scheduledDate),
    tone: meta.tone,
    statusLabel: meta.label,
  };
}

/**
 * Compétition → entrée de calendrier (ADR-24 §5). Date = jour de début. Le `statusLabel`
 * porte le libellé « Compétition » pour distinguer ces entrées des séances dans la grille
 * partagée (les deux rôles consomment `GET /competitions`, role-aware). Navigue vers le
 * détail (athlète) ou l'édition (coach), résolu par le parent via `kind`.
 */
export function competitionToCalendarEntry(c: Competition): CalendarEntry {
  const meta = COMPETITION_STATUS_META[c.status];
  const title = c.name?.trim();
  return {
    id: c.id,
    kind: 'competition',
    title: title && title.length > 0 ? title : 'Compétition',
    date: normalizeDate(c.startDate),
    tone: meta.tone,
    statusLabel: `Compétition · ${meta.label}`,
  };
}

/** Les tonalités d'affectation (success/warning/danger/neutral) sont déjà des `CalendarTone`. */
function toneFromAssignment(tone: 'success' | 'warning' | 'danger' | 'neutral'): CalendarTone {
  return tone;
}

/* ----------------------------------------------------------------------------
 * Helpers de date (UTC, purs et déterministes — testables sans fuseau local).
 * -------------------------------------------------------------------------- */

/** Clé jour `YYYY-MM-DD` en UTC. */
export function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Lundi (UTC, minuit) de la semaine contenant `date`. */
export function startOfWeek(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dow = d.getUTCDay(); // 0 = dimanche … 6 = samedi
  const sinceMonday = (dow + 6) % 7;
  d.setUTCDate(d.getUTCDate() - sinceMonday);
  return d;
}

/** `date` décalée de `n` jours (UTC), sans mutation de l'argument. */
export function addDays(date: Date, n: number): Date {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

/** Les 7 jours (lundi → dimanche) d'une semaine à partir de son début. */
export function weekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

/** Vrai si deux dates tombent le même jour calendaire (UTC). */
export function isSameDay(a: Date, b: Date): boolean {
  return dayKey(a) === dayKey(b);
}

/* ----------------------------------------------------------------------------
 * Regroupement.
 * -------------------------------------------------------------------------- */

/** Regroupe les entrées **datées** par clé jour (les non planifiées sont exclues). */
export function groupEntriesByDay(entries: CalendarEntry[]): Map<string, CalendarEntry[]> {
  const map = new Map<string, CalendarEntry[]>();
  for (const entry of entries) {
    if (!entry.date) continue;
    const list = map.get(entry.date);
    if (list) list.push(entry);
    else map.set(entry.date, [entry]);
  }
  return map;
}

/** Un jour de la grille hebdomadaire : sa date, sa clé, et ses entrées. */
export interface CalendarDay {
  date: Date;
  key: string;
  entries: CalendarEntry[];
}

/** Les 7 jours de la semaine `weekStart` avec leurs entrées (issues du regroupement). */
export function weekView(entries: CalendarEntry[], weekStart: Date): CalendarDay[] {
  const grouped = groupEntriesByDay(entries);
  return weekDays(weekStart).map((date) => {
    const key = dayKey(date);
    return { date, key, entries: grouped.get(key) ?? [] };
  });
}

/** Vrai si au moins un jour de la semaine porte une entrée. */
export function weekHasEntries(days: CalendarDay[]): boolean {
  return days.some((d) => d.entries.length > 0);
}

/** Entrées non planifiées (sans date), à présenter à part. */
export function undatedEntries(entries: CalendarEntry[]): CalendarEntry[] {
  return entries.filter((e) => !e.date);
}

/* ----------------------------------------------------------------------------
 * Formatage FR (UTC pour ne pas décaler une date calendaire).
 * -------------------------------------------------------------------------- */

/** Étiquette jour courte : « lun. 12 ». */
export function formatDayLabel(date: Date): string {
  return date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** Étiquette de semaine : « Semaine du 12 mai ». */
export function formatWeekLabel(weekStart: Date): string {
  const label = weekStart.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
  return `Semaine du ${label}`;
}
