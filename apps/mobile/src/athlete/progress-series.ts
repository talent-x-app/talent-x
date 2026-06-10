import type { ProgressPoint, ProgressSeries } from '@talent-x/api-client';

/**
 * Progression athlète (A-06 — TLX-090, ADR-21) : helpers purs de l'écran. Le contrat
 * livre une série par épreuve (points datés, triés) ; le **découpage temporel** et la
 * mise à l'échelle des graphes se font côté client (ADR-21).
 */
export type ProgressWindow = 'week' | 'month' | 'year';

export const PROGRESS_WINDOWS: { value: ProgressWindow; label: string; days: number }[] = [
  { value: 'week', label: 'Semaine', days: 7 },
  { value: 'month', label: 'Mois', days: 30 },
  { value: 'year', label: 'Année', days: 365 },
];

/** Points de la fenêtre glissante (bornée à `now`, date du jour incluse). */
export function pointsInWindow(
  points: ProgressPoint[],
  window: ProgressWindow,
  now: Date,
): ProgressPoint[] {
  const days = PROGRESS_WINDOWS.find((w) => w.value === window)?.days ?? 30;
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - days);
  return points.filter((p) => {
    const d = new Date(`${p.date}T00:00:00.000Z`);
    return !Number.isNaN(d.getTime()) && d >= start;
  });
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
 * Hauteurs relatives (0.15..1) des barres du graphe — échelle min/max de la fenêtre,
 * plancher pour que chaque marque reste visible. Série plate → barres à mi-hauteur.
 */
export function barHeights(points: ProgressPoint[]): number[] {
  if (points.length === 0) return [];
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return values.map(() => 0.5);
  return values.map((v) => 0.15 + 0.85 * ((v - min) / (max - min)));
}
