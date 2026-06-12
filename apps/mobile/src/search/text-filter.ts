/**
 * Filtre texte client (TLX-117) — module pur, testable isolément. Recherche
 * **insensible à la casse et aux accents** (« lea » trouve « Léa »), par sous-chaîne.
 * Une requête vide ne filtre rien (toute la liste). Aucune dépendance UI.
 */

// Marques diacritiques combinantes (U+0300–U+036F) — via RegExp pour éviter tout
// caractère combinant littéral dans la source.
const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g');

/** Minuscule + suppression des diacritiques (NFD) + trim. */
export function normalizeText(value: string): string {
  return value.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase().trim();
}

/** `haystack` contient-il la requête (normalisée des deux côtés) ? Requête vide → vrai. */
export function matchesQuery(haystack: string, query: string): boolean {
  const q = normalizeText(query);
  if (q.length === 0) return true;
  return normalizeText(haystack).includes(q);
}

/**
 * Filtre une liste sur le texte extrait de chaque élément. Requête vide → liste inchangée
 * (même référence d'éléments, ordre préservé).
 */
export function filterByText<T>(items: T[], query: string, getText: (item: T) => string): T[] {
  if (normalizeText(query).length === 0) return items;
  return items.filter((item) => matchesQuery(getText(item), query));
}
