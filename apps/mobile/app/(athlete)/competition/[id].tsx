import { useLocalSearchParams } from 'expo-router';
import { CompetitionDetailScreen } from '../../../src/athlete/CompetitionDetailScreen';

/**
 * Détail d'une compétition (athlète, lecture seule — TLX-101, ADR-24) — route empilée.
 *
 * `key={id}` (ADR-58) : écran d'onglet masqué, jamais démonté. Cet écran ne porte aujourd'hui
 * aucun état local rémanent — la clé le protège de celui qu'on y ajoutera.
 */
export default function CompetitionDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <CompetitionDetailScreen key={id} competitionId={id} />;
}
