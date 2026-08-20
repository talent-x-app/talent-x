import { useLocalSearchParams } from 'expo-router';
import { AthleteDetailScreen } from '../../../src/coach/AthleteDetailScreen';

/**
 * Détail d'un athlète (C-03, TLX-045) — route empilée hors tab bar.
 *
 * `key={id}` (ADR-58) : écran d'onglet masqué, jamais démonté. Cet écran ne porte aujourd'hui
 * aucun état local rémanent — la clé le protège de celui qu'on y ajoutera.
 */
export default function AthleteDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <AthleteDetailScreen key={id} />;
}
