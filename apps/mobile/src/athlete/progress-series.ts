import type { ProgressPoint, ProgressSeries } from '@talent-x/api-client';

/**
 * Progression athlète (A-06 — TLX-090, ADR-21) : helpers purs de l'écran. Le contrat
 * livre une série par épreuve (points datés, triés) ; le **découpage temporel** et la
 * mise à l'échelle des graphes se font côté client (ADR-21).
 */
export type ProgressWindow = 'week' | 'month' | 'year' | 'all';

export const PROGRESS_WINDOWS: { value: ProgressWindow; label: string }[] = [
  { value: 'week', label: 'Semaine' },
  { value: 'month', label: 'Mois' },
  { value: 'year', label: 'Année' },
  { value: 'all', label: 'Tout' },
];

/** Intervalle [start, end) d'une **période calendaire** (ADR-56) : semaine lun→dim, mois, année.
 *  `offset` décale vers le passé (−1 = période précédente). `null` pour « Tout » (tout l'historique). */
export function periodRange(
  window: ProgressWindow,
  offset: number,
  now: Date,
): { start: Date; end: Date } | null {
  if (window === 'all') return null;
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  if (window === 'year') {
    const year = y + offset;
    return { start: new Date(Date.UTC(year, 0, 1)), end: new Date(Date.UTC(year + 1, 0, 1)) };
  }
  if (window === 'month') {
    const start = new Date(Date.UTC(y, m + offset, 1));
    return {
      start,
      end: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1)),
    };
  }
  // Semaine : lundi → dimanche, décalée de `offset` semaines.
  const dow = (new Date(Date.UTC(y, m, d)).getUTCDay() + 6) % 7; // lundi = 0
  const monday = new Date(Date.UTC(y, m, d - dow + offset * 7));
  return {
    start: monday,
    end: new Date(Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate() + 7)),
  };
}

/** Points dans la période (intervalle `[start, end)`). `null` (« Tout ») → tous les points. */
export function pointsInPeriod(
  points: ProgressPoint[],
  range: { start: Date; end: Date } | null,
): ProgressPoint[] {
  if (!range) return points;
  const s = range.start.getTime();
  const e = range.end.getTime();
  return points.filter((p) => {
    const t = Date.parse(`${p.date}T00:00:00.000Z`);
    return !Number.isNaN(t) && t >= s && t < e;
  });
}

/** Libellé lisible d'une période : « 9–15 juin », « juin 2026 », « 2026 », « Tout ». */
export function periodLabel(window: ProgressWindow, offset: number, now: Date): string {
  const r = periodRange(window, offset, now);
  if (!r) return 'Tout';
  if (window === 'year') return String(r.start.getUTCFullYear());
  if (window === 'month') {
    return r.start.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  }
  const endIncl = new Date(r.end.getTime() - 86_400_000);
  const dayMonth = { day: 'numeric', month: 'short', timeZone: 'UTC' } as const;
  if (r.start.getUTCMonth() === endIncl.getUTCMonth()) {
    return `${r.start.getUTCDate()}–${endIncl.toLocaleDateString('fr-FR', dayMonth)}`;
  }
  return `${r.start.toLocaleDateString('fr-FR', dayMonth)} – ${endIncl.toLocaleDateString('fr-FR', dayMonth)}`;
}

/**
 * Tendance première → dernière marque de la fenêtre, dans le **sens de l'épreuve**
 * (`min` : un chrono qui baisse progresse). `undefined` à moins de deux points.
 */
export function seriesTrend(
  points: ProgressPoint[],
  direction: ProgressSeries['direction'],
): 'up' | 'down' | 'flat' | undefined {
  if (points.length < 2) return undefined;
  const first = points[0].value;
  const last = points[points.length - 1].value;
  if (last === first) return 'flat';
  const improved = direction === 'min' ? last < first : last > first;
  return improved ? 'up' : 'down';
}

/**
 * Hauteurs relatives (0.12..0.88) des points de la **courbe** de progression (R9), **orientées
 * par la performance** (ADR-21/34) : une meilleure marque est toujours plus haute, quel que soit le
 * sens de l'épreuve (`min` → un chrono plus bas est meilleur, donc tracé plus haut). Marge haut/bas
 * pour que les points extrêmes ne collent pas aux bords. Série plate → ligne à mi-hauteur.
 */
export function perfHeights(
  points: ProgressPoint[],
  direction: ProgressSeries['direction'],
): number[] {
  if (points.length === 0) return [];
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return values.map(() => 0.5);
  return values.map((v) => {
    const raw = (v - min) / (max - min); // 0..1, 1 = valeur brute la plus haute
    const perf = direction === 'min' ? 1 - raw : raw; // 1 = meilleure performance
    return 0.12 + 0.76 * perf;
  });
}

/**
 * Agrégation d'affichage selon la fenêtre (ADR-56, densité) : en **Année** et **Tout**, on condense
 * en **meilleure marque par semaine** pour éviter la « soupe de points » ; Semaine/Mois restent
 * inchangés (déjà best/jour côté backend). Chaque point conservé est un **vrai jour** (avec ses
 * `others`) → le détail du jour reste exact.
 */
export function aggregateForWindow(
  points: ProgressPoint[],
  window: ProgressWindow,
  direction: ProgressSeries['direction'],
): ProgressPoint[] {
  if ((window !== 'year' && window !== 'all') || points.length === 0) return points;
  const WEEK_MS = 7 * 86_400_000;
  const at = (p: ProgressPoint) => Date.parse(`${p.date}T00:00:00.000Z`);
  // Semaines **relatives à la première marque** (prévisible, indépendant de l'ancrage epoch).
  const t0 = Math.min(...points.map(at));
  const best = new Map<number, ProgressPoint>();
  for (const p of points) {
    const week = Math.floor((at(p) - t0) / WEEK_MS);
    const cur = best.get(week);
    if (!cur || (direction === 'min' ? p.value < cur.value : p.value > cur.value)) {
      best.set(week, p);
    }
  }
  return [...best.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Fractions X (0..1) **proportionnelles au temps** des marques (ADR-56) : un grand écart de dates
 * occupe plus de largeur qu'un petit (axe honnête vs espacement par index). ≤ 1 point → centré ;
 * toutes les marques le même jour → espacement régulier (repli).
 */
export function timeFractions(points: ProgressPoint[]): number[] {
  if (points.length <= 1) return points.map(() => 0.5);
  const ts = points.map((p) => Date.parse(`${p.date}T00:00:00.000Z`));
  const t0 = ts[0];
  const span = ts[ts.length - 1] - t0;
  if (span <= 0) return points.map((_, i) => i / (points.length - 1));
  return ts.map((t) => (t - t0) / span);
}

/**
 * Delta net de la fenêtre (première → dernière marque), **orienté performance** (ADR-56) :
 * `improved` vrai si on progresse au sens de l'épreuve (chrono qui baisse *ou* distance qui monte).
 * `magnitude` = ampleur absolue du changement (arrondie). `null` à moins de deux points.
 */
export function windowDelta(
  points: ProgressPoint[],
  direction: ProgressSeries['direction'],
): { magnitude: number; improved: boolean; changed: boolean; fromDate: string } | null {
  if (points.length < 2) return null;
  const first = points[0];
  const last = points[points.length - 1];
  const delta = last.value - first.value;
  const changed = delta !== 0;
  const improved = direction === 'min' ? delta < 0 : delta > 0;
  return {
    magnitude: Math.round(Math.abs(delta) * 100) / 100,
    improved,
    changed,
    fromDate: first.date,
  };
}

/** Index de la meilleure marque de la fenêtre (selon le sens de l'épreuve). `-1` si vide. */
export function bestIndex(points: ProgressPoint[], direction: ProgressSeries['direction']): number {
  if (points.length === 0) return -1;
  let best = 0;
  for (let i = 1; i < points.length; i++) {
    const better =
      direction === 'min'
        ? points[i].value < points[best].value
        : points[i].value > points[best].value;
    if (better) best = i;
  }
  return best;
}
