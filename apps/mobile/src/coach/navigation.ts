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
