import { AthleteSessionsTabsScreen } from '../../src/athlete/AthleteSessionsTabsScreen';

/**
 * Route Calendrier athlète (ADR-44) — hors tab bar : ouvre la surface Séances unifiée directement
 * sur la vue calendrier (atteinte via le raccourci d'accueil ou la bascule de l'onglet Séances).
 */
export default function AthleteCalendarRoute() {
  return <AthleteSessionsTabsScreen initialView="calendar" />;
}
