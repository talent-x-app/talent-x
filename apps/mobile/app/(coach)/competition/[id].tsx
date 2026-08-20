import { useLocalSearchParams } from 'expo-router';
import { CompetitionBuilderScreen } from '../../../src/coach/CompetitionBuilderScreen';

/**
 * Édition d'une compétition (TLX-101, ADR-24) — route empilée hors tab bar.
 *
 * `key={id}` (ADR-58) : écran d'onglet masqué, jamais démonté. Le formulaire est réhydraté par
 * un effet sur les données chargées, mais `error` ne l'était pas, et la compétition suivante
 * s'ouvrait sur les champs de la précédente en attendant sa réponse.
 */
export default function EditCompetitionRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <CompetitionBuilderScreen key={id} competitionId={id} />;
}
