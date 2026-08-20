import { useLocalSearchParams } from 'expo-router';
import { CoachSessionDetailScreen } from '../../../src/coach/CoachSessionDetailScreen';

/**
 * Détail d'une séance en lecture seule (C-05) — mode par défaut, route empilée hors tab bar.
 *
 * `key={id}` (ADR-58) : écran d'onglet masqué, jamais démonté. Sans clé, la confirmation de
 * suppression ouverte sur une séance se rouvrait sur la suivante, en visant celle-ci
 * (TLX-245) — un état rémanent qui armait une action destructrice sur la mauvaise cible.
 */
export default function CoachSessionDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <CoachSessionDetailScreen key={id} />;
}
