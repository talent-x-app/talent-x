import { useLocalSearchParams } from 'expo-router';
import { CoachGroupDetailScreen } from '../../../src/groups/CoachGroupDetailScreen';

/** Détail & gestion d'un groupe coach (TLX-87) — route empilée hors tab bar. */
export default function CoachGroupDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <CoachGroupDetailScreen groupId={id} />;
}
