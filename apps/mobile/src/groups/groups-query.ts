/**
 * Clés de cache des groupes (TLX-041 backend, TLX-87/88 front). Module **sans dépendance
 * UI** : les écrans coach (liste/détail/membres) et la section athlète partagent et
 * invalident ce cache sans tirer le graphe d'un écran.
 */

/** Liste des groupes du coach courant. */
export const GROUPS_QUERY_KEY = ['groups'] as const;

/** Détail d'un groupe (coach). */
export function groupQueryKey(groupId: string) {
  return ['groups', groupId] as const;
}

/** Membres actifs d'un groupe (coach). */
export function groupMembersQueryKey(groupId: string) {
  return ['groups', groupId, 'members'] as const;
}

/** Groupes de l'athlète courant + coach (ADR-26 — `GET /groups/mine`). */
export const MY_GROUPS_QUERY_KEY = ['groups', 'mine'] as const;

/** Coéquipiers d'un groupe vus par un athlète membre (ADR-37 — `GET /groups/:id/teammates`). */
export function groupTeammatesQueryKey(groupId: string) {
  return ['groups', groupId, 'teammates'] as const;
}

/**
 * Affectations de l'athlète courant (`GET /assignments`, role-aware). Le hub de groupe (fil
 * Séances + Calendrier, ADR-43 §4) lit ce **même** cache que l'écran Séances (A-02) et le
 * regroupe côté client — pas de provenance de groupe avant le Lot 2 (ADR-30), donc le fil
 * couvre toutes les séances de l'athlète. Source unique → invalidations partagées.
 */
export const ASSIGNMENTS_QUERY_KEY = ['assignments'] as const;

/** Détail d'une affectation (`GET /assignments/:id`) — séance embarquée, lecture seule. */
export function assignmentQueryKey(assignmentId: string) {
  return ['assignments', assignmentId] as const;
}
