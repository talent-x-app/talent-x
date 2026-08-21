import { isBetter } from './record-detection';

/**
 * Saison & marques par année (ADR-34) — module pur, dérivé des points d'une série de
 * progression (ADR-21). **Saison = année civile** : pas de split indoor/outdoor (aucune
 * donnée de lieu ; marques surtout d'entraînement → la date ne dit pas le lieu). `now` est
 * injecté (déterminisme, testable isolément — comme `training-load.ts`).
 *
 * - `seasonBest` = meilleure marque (sens `min`/`max` de l'épreuve) de l'**année en cours**
 *   (absent si aucune marque cette année) ;
 * - `marksByYear` = meilleure marque + nombre de marques par année, **décroissant** par année.
 *   Le compte porte sur les **marques**, pas sur les points : un point condense la journée et
 *   porte ses `others` (TLX-244).
 */
export interface DatedMark {
  date: Date;
  value: number;
  /**
   * Autres marques du **même jour** (ADR-56). Un point de série n'est pas une marque : le
   * backend condense en meilleure marque par jour et range le reste ici. Sans ce champ,
   * `count` comptait des **jours** sous le mot « marques » (TLX-244).
   */
  others?: readonly number[];
}

export interface SeasonPoint {
  date: string;
  value: number;
}

export interface MarkByYear {
  year: number;
  best: number;
  count: number;
}

export interface SeasonAggregates {
  seasonBest?: SeasonPoint;
  marksByYear: MarkByYear[];
}

/** Année civile (UTC) d'une marque — cohérent avec le découpage de jour UTC du backend. */
function yearOf(date: Date): number {
  return date.getUTCFullYear();
}

export function seasonAggregates(
  points: readonly DatedMark[],
  direction: 'min' | 'max',
  now: Date,
): SeasonAggregates {
  const currentYear = yearOf(now);
  const byYear = new Map<number, { best: number; count: number }>();
  let seasonBest: { date: Date; value: number } | undefined;

  for (const point of points) {
    const year = yearOf(point.date);
    // TLX-244 — le point tracé **plus** les autres marques du même jour. L'athlète qui saisit
    // deux marques le même jour en voit deux dans le détail du jour ; la ligne de saison en
    // annonçait une seule, à trois lignes d'écart sur le même écran.
    const marks = 1 + (point.others?.length ?? 0);

    const agg = byYear.get(year);
    if (!agg) {
      byYear.set(year, { best: point.value, count: marks });
    } else {
      agg.count += marks;
      if (isBetter(point.value, agg.best, direction)) agg.best = point.value;
    }

    if (year === currentYear) {
      // Tie sur la valeur → on garde la marque la plus ancienne (1re fois atteinte).
      if (
        !seasonBest ||
        isBetter(point.value, seasonBest.value, direction) ||
        (point.value === seasonBest.value && point.date < seasonBest.date)
      ) {
        seasonBest = { date: point.date, value: point.value };
      }
    }
  }

  const marksByYear: MarkByYear[] = [...byYear.entries()]
    .map(([year, { best, count }]) => ({ year, best, count }))
    .sort((a, b) => b.year - a.year);

  return {
    seasonBest: seasonBest
      ? { date: seasonBest.date.toISOString().slice(0, 10), value: seasonBest.value }
      : undefined,
    marksByYear,
  };
}
