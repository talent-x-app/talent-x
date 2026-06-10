/**
 * Clé de cache des compétitions (TLX-101, ADR-24). Module **sans dépendance UI** : la liste
 * coach, le calendrier et les écrans d'édition/engagement partagent et invalident ce cache
 * sans tirer tout le graphe d'un écran. `['competitions']` est volontairement role-agnostic —
 * le backend filtre par rôle (coach : les siennes ; athlète : engagées).
 */
export const COMPETITIONS_QUERY_KEY = ['competitions'] as const;

/** Clé de cache des engagements d'une compétition donnée (détail/engagement). */
export function competitionEntriesQueryKey(competitionId: string) {
  return ['competitions', competitionId, 'entries'] as const;
}
