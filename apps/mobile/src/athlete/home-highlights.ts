import {
  AssignmentStatus,
  type Assignment,
  type Notification,
  type PersonalRecord,
} from '@talent-x/api-client';
import { assignmentDate } from './home-model';

/**
 * Aperçus « au coup d'œil » de l'accueil athlète (TLX-148) — module pur, sans dépendance UI.
 * Alimente les cartes Progression et « Dernier retour du coach » en respectant le principe
 * de l'accueil (cf. en-tête `AthleteHomeScreen`) : dérivations depuis des caches déjà chargés
 * (`['assignments']`, `['notifications','me']` via la cloche) + la seule requête légère records
 * (`['records','me']`, cache partagé avec A-07 qu'elle réchauffe au passage).
 */

/** Record personnel le plus récent (par date d'obtention). `null` si aucun. */
export function latestRecord(records: PersonalRecord[]): PersonalRecord | null {
  let best: PersonalRecord | null = null;
  for (const r of records) {
    if (!best || r.achievedAt.localeCompare(best.achievedAt) > 0) best = r;
  }
  return best;
}

/**
 * Complétion du mois calendaire courant (UTC, aligné backend) : séances réalisées / séances du
 * mois **échues ou réalisées** (une séance planifiée plus tard dans le mois ne compte pas encore
 * contre l'athlète). `null` si rien à compter — la carte n'affiche alors pas de taux.
 */
export function monthCompletion(
  assignments: Assignment[],
  now: Date,
): { completed: number; total: number } | null {
  let completed = 0;
  let total = 0;
  for (const a of assignments) {
    const iso = assignmentDate(a);
    if (!iso) continue;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) continue;
    if (d.getUTCFullYear() !== now.getUTCFullYear() || d.getUTCMonth() !== now.getUTCMonth()) {
      continue;
    }
    const done = a.status === AssignmentStatus.completed;
    // Échue = date de référence passée (ou aujourd'hui) ; les séances futures du mois ne comptent
    // que si déjà réalisées.
    if (done || d.getTime() <= now.getTime()) {
      total += 1;
      if (done) completed += 1;
    }
  }
  return total > 0 ? { completed, total } : null;
}

/**
 * Dernier retour du coach : notification `performance_feedback` la plus récente du feed
 * (ADR-22/23 — le feed est la seule source agrégée « tous contextes » sans nouvel endpoint,
 * option (a) du ticket). `resourceId` = affectation → navigable vers le détail de séance.
 */
export function latestCoachFeedback(notifications: Notification[]): Notification | null {
  let latest: Notification | null = null;
  for (const n of notifications) {
    if (n.type !== 'performance_feedback') continue;
    if (!latest || n.createdAt.localeCompare(latest.createdAt) > 0) latest = n;
  }
  return latest;
}
