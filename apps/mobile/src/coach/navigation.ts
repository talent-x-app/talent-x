import type { DashboardAthlete } from '@talent-x/api-client';
import { athleteFullName } from './athlete-ui';

/**
 * Cible de navigation vers le détail athlète (C-03). L'identité (nom, statut, sport)
 * est passée en paramètres pour un rendu immédiat : `GET /athletes/:id/stats` ne
 * renvoie que les métriques, pas l'identité.
 */
export function athleteDetailHref(athlete: DashboardAthlete) {
  return {
    pathname: '/(coach)/athlete/[id]' as const,
    params: {
      id: athlete.id,
      name: athleteFullName(athlete),
      status: athlete.status,
      sport: athlete.sport ?? '',
    },
  };
}

/**
 * Cible de navigation vers l'écran d'assignation (C-06/C-07, TLX-063). Le titre de la séance
 * est passé en paramètre pour un rendu immédiat (l'écran ne recharge pas la séance).
 */
export function assignSessionHref(sessionId: string, sessionTitle?: string) {
  return {
    pathname: '/(coach)/assign/[id]' as const,
    params: { id: sessionId, title: sessionTitle ?? '' },
  };
}

/** Détail d'une séance en **lecture seule** (consultation, mode par défaut côté coach). */
export function coachSessionDetailHref(sessionId: string) {
  return { pathname: '/(coach)/session/[id]' as const, params: { id: sessionId } };
}

/** Édition d'une séance (constructeur C-05) — depuis le détail lecture seule. */
export function editSessionHref(sessionId: string) {
  return { pathname: '/(coach)/session/[id]/edit' as const, params: { id: sessionId } };
}
