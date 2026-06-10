import { useLocalSearchParams } from 'expo-router';
import { CompetitionDetailScreen } from '../../../src/athlete/CompetitionDetailScreen';

/** Détail d'une compétition (athlète, lecture seule — TLX-101, ADR-24) — route empilée. */
export default function CompetitionDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <CompetitionDetailScreen competitionId={id} />;
}
