import { useLocalSearchParams } from 'expo-router';
import { CompetitionBuilderScreen } from '../../../src/coach/CompetitionBuilderScreen';

/** Édition d'une compétition (TLX-101, ADR-24) — route empilée hors tab bar. */
export default function EditCompetitionRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <CompetitionBuilderScreen competitionId={id} />;
}
