import { useLocalSearchParams } from 'expo-router';
import { CompetitionEngageScreen } from '../../../../src/coach/CompetitionEngageScreen';

/** Engagement d'athlètes à une compétition (TLX-101, ADR-24) — route empilée hors tab bar. */
export default function CompetitionEngageRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <CompetitionEngageScreen competitionId={id} />;
}
