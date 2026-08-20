import { useLocalSearchParams } from 'expo-router';
import { CoachReviewScreen } from '../../../src/coach/CoachReviewScreen';

/**
 * Revue de performance + feedback (C-08, TLX-086) — route empilée hors tab bar.
 *
 * `key={id}` (ADR-58) : écran d'onglet masqué, jamais démonté. Cet écran ne porte aujourd'hui
 * aucun état local rémanent — la clé le protège de celui qu'on y ajoutera.
 */
export default function CoachReviewRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <CoachReviewScreen key={id} />;
}
