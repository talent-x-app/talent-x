import { AssignmentStatus, type Assignment } from '@talent-x/api-client';

/**
 * Dérivations pures de l'accueil athlète (A-01 — TLX-089). Sans dépendance UI : sélectionnent
 * et trient les affectations déjà en cache (`['assignments']`, partagé avec A-02/calendrier)
 * pour alimenter la section « À faire » et le compteur du jour, sans appel réseau additionnel.
 */

/** Statuts « à faire » — aligné sur l'écran Séances (A-02) et le backend (`PENDING_STATUSES`). */
const PENDING_STATUSES: AssignmentStatus[] = [
  AssignmentStatus.assigned,
  AssignmentStatus.in_progress,
];

/** Une affectation est « à faire » si elle n'est ni réalisée ni manquée. */
export function isPending(assignment: Assignment): boolean {
  return PENDING_STATUSES.includes(assignment.status);
}

/** Date de référence d'une affectation : échéance, à défaut date planifiée de la séance. */
export function assignmentDate(assignment: Assignment): string | undefined {
  return assignment.dueDate ?? assignment.session?.scheduledDate ?? undefined;
}

/**
 * Affectations à faire, **plus proche échéance d'abord** (ordre croissant), les sans-date en
 * dernier. Inverse du tri de la liste A-02 (décroissant) : l'accueil met en avant l'imminent.
 */
export function selectPendingAssignments(list: Assignment[]): Assignment[] {
  return list.filter(isPending).sort((a, b) => {
    const da = assignmentDate(a);
    const db = assignmentDate(b);
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return da.localeCompare(db);
  });
}

/** Une affectation tombe « aujourd'hui » si sa date de référence est le jour courant (UTC, cf. backend). */
export function isDueToday(assignment: Assignment, now: Date): boolean {
  const iso = assignmentDate(assignment);
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return (
    d.getUTCFullYear() === now.getUTCFullYear() &&
    d.getUTCMonth() === now.getUTCMonth() &&
    d.getUTCDate() === now.getUTCDate()
  );
}

/** Nombre d'affectations à faire dont l'échéance est aujourd'hui. */
export function countDueToday(list: Assignment[], now: Date): number {
  return list.filter((a) => isPending(a) && isDueToday(a, now)).length;
}
