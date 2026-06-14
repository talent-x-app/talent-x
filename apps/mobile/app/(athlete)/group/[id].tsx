import { useLocalSearchParams } from 'expo-router';
import { AthleteGroupDetailScreen } from '../../../src/groups/AthleteGroupDetailScreen';

/** Détail d'un groupe (athlète) : coéquipiers + quitter (ADR-37) — route empilée hors tab bar. */
export default function AthleteGroupDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <AthleteGroupDetailScreen groupId={id} />;
}
