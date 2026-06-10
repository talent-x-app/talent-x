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
