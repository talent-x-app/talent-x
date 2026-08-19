/**
 * Clés de cache des groupes (TLX-041 backend, TLX-87/88 front). Module **sans dépendance
 * UI** : les écrans coach (liste/détail/membres) et la section athlète partagent et
 * invalident ce cache sans tirer le graphe d'un écran.
 */
import { listGroups, type Group } from '@talent-x/api-client';
import { queryOptions } from '@tanstack/react-query';

/** Liste des groupes du coach courant. */
export const GROUPS_QUERY_KEY = ['groups'] as const;

/**
 * Producteur **unique** de `['groups']` (TLX-238).
 *
 * Deux écrans peuplaient cette clé avec des formes incompatibles — `CoachGroupsScreen` le
 * `Group[]` déballé, `CoachAssignScreen` l'enveloppe `{ data, meta }` — chacun typant son
 * propre `useQuery`. Les clés TanStack n'étant pas typées globalement, les deux annotations
 * étaient localement cohérentes et mutuellement contradictoires : le compilateur ne pouvait
 * pas les rapprocher. Le dernier écran monté gagnait le cache et cassait l'autre, l'un par
 * `groups.map is not a function`, l'autre par une liste vide **sans erreur**.
 *
 * Le défaut de fond n'était pas la forme retenue mais l'existence de deux producteurs : ce
 * module se présentait déjà comme le propriétaire du cache des groupes sans en détenir la
 * `queryFn`. Forme canonique : `Group[]` — `meta` n'est consommé nulle part.
 *
 * Les options de requête (retry, meta…) restent à la main de l'appelant : elles n'influent
 * pas sur ce qui est **écrit** dans le cache, seule chose que cette clé doit garantir.
 */
export function coachGroupsQuery() {
  return queryOptions({
    queryKey: GROUPS_QUERY_KEY,
    queryFn: async (): Promise<Group[]> => {
      const response = await listGroups();
      if (response.status === 200) return response.data.data;
      throw response;
    },
  });
}

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

/** Annonces d'un groupe (ADR-46 — `GET /groups/:id/announcements`). Partagé coach ↔ athlète. */
export function groupAnnouncementsQueryKey(groupId: string) {
  return ['groups', groupId, 'announcements'] as const;
}

/** Pouls d'équipe (ADR-48, Palier 1 — `GET /groups/:id/pulse`). Agrégat dérivé, partagé coach ↔ athlète. */
export function groupPulseQueryKey(groupId: string) {
  return ['groups', groupId, 'pulse'] as const;
}

/** Fil de réponses d'une annonce (ADR-48 Palier 3 / ADR-50 — `GET …/announcements/:aid/replies`). */
export function announcementRepliesQueryKey(groupId: string, announcementId: string) {
  return ['groups', groupId, 'announcements', announcementId, 'replies'] as const;
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

/**
 * Coéquipiers ayant confirmé leur présence sur la séance de cette affectation
 * (ADR-48/49 Palier 2 — `GET /assignments/:id/teammates-attendance`). Aligné sur le préfixe
 * `['assignment', id, …]` du détail séance (comme l'agrégat de présence) pour une invalidation
 * cohérente quand l'athlète change sa propre présence.
 */
export function teammatesAttendanceQueryKey(assignmentId: string) {
  return ['assignment', assignmentId, 'teammates-attendance'] as const;
}
