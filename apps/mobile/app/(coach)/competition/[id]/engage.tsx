import { useLocalSearchParams } from 'expo-router';
import { CompetitionEngageScreen } from '../../../../src/coach/CompetitionEngageScreen';

/**
 * Engagement d'athlètes à une compétition (TLX-101, ADR-24) — route empilée hors tab bar.
 *
 * `key={id}` (ADR-58) : écran d'onglet masqué, jamais démonté. Sans clé, la sélection
 * d'athlètes et surtout le **récapitulatif d'engagement** (`confirmedNames`) d'une compétition
 * s'affichaient sur la suivante — exactement le défaut que le `key` de `assign/[id]` avait
 * déjà corrigé une fois (TLX-93).
 */
export default function CompetitionEngageRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <CompetitionEngageScreen key={id} competitionId={id} />;
}
