import { CoachSessionsTabsScreen } from '../../src/coach/CoachSessionsTabsScreen';

/** Onglet Séances coach (ADR-53) — surface unique Liste ⇄ Calendrier. */
export default function CoachSessionsRoute() {
  return <CoachSessionsTabsScreen initialView="list" />;
}
