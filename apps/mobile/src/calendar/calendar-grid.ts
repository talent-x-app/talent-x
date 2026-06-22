import type { Assignment } from '@talent-x/api-client';

/**
 * Helpers **purs** de calendrier de séances (ADR-47) — sans état ni I/O. Grille mensuelle / bande
 * hebdo + regroupement par jour, calculés **côté client** sur `GET /assignments`. Comparaisons par
 * **clé de jour** (`YYYY-MM-DD`) pour rester insensible au fuseau. Partagé par le calendrier de
 * l'onglet Séances (toutes les séances) et le calendrier du hub de groupe (séances du coach).
 */

/** Date de référence d'une affectation : échéance, sinon date programmée de la séance. */
export function assignmentDate(a: Pick<Assignment, 'dueDate' | 'session'>): string | undefined {
  return a.dueDate ?? a.session?.scheduledDate ?? undefined;
}

/** Clé de jour `YYYY-MM-DD` d'une date ISO (partie date si présente, sinon dérivée locale). */
export function isoDayKey(iso: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(iso);
  if (m) return m[1];
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : dayKeyOf(d);
}

/** Clé de jour `YYYY-MM-DD` d'un objet `Date` (composantes locales). */
export function dayKeyOf(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Clé de jour d'une affectation (ou `undefined` si non datée). */
export function assignmentDayKey(a: Pick<Assignment, 'dueDate' | 'session'>): string | undefined {
  const iso = assignmentDate(a);
  return iso ? isoDayKey(iso) : undefined;
}

/** Index affectations par clé de jour (calendrier, sélection d'un jour). */
export function groupByDay(assignments: readonly Assignment[]): Map<string, Assignment[]> {
  const map = new Map<string, Assignment[]>();
  for (const a of assignments) {
    const key = assignmentDayKey(a);
    if (key == null) continue;
    const bucket = map.get(key);
    if (bucket) bucket.push(a);
    else map.set(key, [a]);
  }
  return map;
}

/** Cellule de grille calendrier. */
export interface DayCell {
  key: string;
  date: Date;
  day: number;
  /** Appartient au mois affiché (`false` pour les jours débordants). */
  inMonth: boolean;
}

/** En-têtes de colonnes du calendrier (semaine débutant le lundi). */
export const WEEKDAY_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'] as const;

/** Rang lundi=0 … dimanche=6 d'un `Date` (JS place dimanche à 0). */
function mondayIndex(d: Date): number {
  return (d.getDay() + 6) % 7;
}

/**
 * Grille mensuelle (lundi en tête) : semaines complètes du lundi ≤ 1er jour au dimanche ≥ dernier
 * jour du mois. Les cellules débordantes portent `inMonth: false` (estompées dans la maquette).
 */
export function buildMonthGrid(year: number, monthIndex: number): DayCell[][] {
  const first = new Date(year, monthIndex, 1);
  const start = new Date(year, monthIndex, 1 - mondayIndex(first));
  const last = new Date(year, monthIndex + 1, 0);
  const end = new Date(year, monthIndex, last.getDate() + (6 - mondayIndex(last)));

  const weeks: DayCell[][] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const week: DayCell[] = [];
    for (let i = 0; i < 7; i++) {
      week.push({
        key: dayKeyOf(cursor),
        date: new Date(cursor),
        day: cursor.getDate(),
        inMonth: cursor.getMonth() === monthIndex,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

/** Semaine (lundi → dimanche) contenant `ref`. Toutes les cellules sont `inMonth: true`. */
export function buildWeek(ref: Date): DayCell[] {
  const monday = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - mondayIndex(ref));
  const week: DayCell[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    week.push({ key: dayKeyOf(d), date: d, day: d.getDate(), inMonth: true });
  }
  return week;
}

/** Libellé du mois (« Juin 2026 »). */
export function formatMonthLabel(year: number, monthIndex: number): string {
  const label = new Date(year, monthIndex, 1).toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Libellé d'une plage de semaine (« 15 – 21 juin »). */
export function formatWeekRange(week: DayCell[]): string {
  if (week.length === 0) return '';
  const start = week[0].date;
  const end = week[week.length - 1].date;
  const endLabel = end.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()} – ${endLabel}`;
  }
  const startLabel = start.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  return `${startLabel} – ${endLabel}`;
}

/** Libellé long d'un jour sélectionné (« Mercredi 17 juin »). */
export function formatDayLabel(date: Date): string {
  const label = date.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}
