import { useLocalSearchParams } from 'expo-router';
import { GroupSessionDetailScreen } from '../../../../src/groups/GroupSessionDetailScreen';

/**
 * Détail lecture seule d'une séance ouverte depuis le hub de groupe (ADR-43, TLX-173). Reçoit
 * l'identifiant d'**affectation** (la séance est embarquée via `GET /assignments/:id`).
 */
export default function GroupSessionDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <GroupSessionDetailScreen assignmentId={id} />;
}
