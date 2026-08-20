import { useLocalSearchParams } from 'expo-router';
import { CoachGroupDetailScreen } from '../../../src/groups/CoachGroupDetailScreen';

/**
 * Détail & gestion d'un groupe coach (TLX-87) — route empilée hors tab bar.
 *
 * `key={id}` (ADR-58) : écran d'onglet masqué, jamais démonté. Sans clé, l'onglet ouvert, la
 * recherche de membre et les panneaux de gestion suivaient d'un groupe à l'autre.
 */
export default function CoachGroupDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <CoachGroupDetailScreen key={id} groupId={id} />;
}
