import { AthleteSessionsTabsScreen } from '../../src/athlete/AthleteSessionsTabsScreen';

/** Onglet Séances athlète (ADR-44) — surface unique liste/calendrier. */
export default function AthleteSessionsRoute() {
  return <AthleteSessionsTabsScreen initialView="list" />;
}
