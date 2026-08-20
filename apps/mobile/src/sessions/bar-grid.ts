/**
 * Bornes et défauts de la **grille de barres** (ADR-25) — module partagé coach ↔ athlète.
 *
 * Il existe parce que les deux côtés lisaient les mêmes `params` avec des règles différentes
 * (TLX-223) : le coach saisissait « Nb de barres » et « Essais / barre » et les prévisualisait,
 * l'athlète recevait une grille dimensionnée par des constantes. Poser les bornes ici est la
 * seule façon d'éviter qu'elles divergent à nouveau — deux bornes différentes reproduiraient
 * le défaut sous une autre forme.
 *
 * `params` est un conteneur **libre** (ADR-18) : ces lecteurs sont défensifs par construction.
 * Une valeur absente, non numérique, nulle ou aberrante retombe sur le défaut ou la borne,
 * jamais sur une grille ingérable.
 */

/** Barres pré-remplies quand le coach fixe départ + montée sans planifier leur nombre (ADR-25). */
export const DEFAULT_BAR_COUNT = 5;

/** Plafond de barres — garde-fou contre une saisie aberrante, pas une règle d'athlétisme. */
export const MAX_BAR_COUNT = 30;

/**
 * Essais par barre par défaut : la règle d'athlétisme (élimination au 3ᵉ échec). Ce n'est
 * qu'un **défaut** — le coach peut en décider autrement pour un entraînement, et c'est
 * précisément l'arbitrage rendu sur TLX-223 : le champ est un réglage, la saisie le lit.
 */
export const DEFAULT_ATTEMPTS_PER_BAR = 3;

/** Plafond d'essais par barre — même rôle que `MAX_BAR_COUNT` : empêcher l'absurde. */
export const MAX_ATTEMPTS_PER_BAR = 10;

/** Entier strictement positif d'un conteneur `params` libre, `undefined` sinon (ADR-18). */
function positiveInt(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.floor(n);
}

/** Nombre de barres planifié par le coach, borné. `undefined` si non planifié. */
export function plannedBarCount(params: unknown): number | undefined {
  const n = positiveInt((params as Record<string, unknown> | undefined)?.bars);
  return n == null ? undefined : Math.min(n, MAX_BAR_COUNT);
}

/** Essais par barre voulus par le coach, bornés. Défaut : la règle d'athlétisme (3). */
export function attemptsPerBar(params: unknown): number {
  const n = positiveInt((params as Record<string, unknown> | undefined)?.attemptsPerBar);
  return n == null ? DEFAULT_ATTEMPTS_PER_BAR : Math.min(n, MAX_ATTEMPTS_PER_BAR);
}
