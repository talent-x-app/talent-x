import { useLocalSearchParams } from 'expo-router';
import { PerfConfirmationScreen } from '../../../src/athlete/PerfConfirmationScreen';

/**
 * Confirmation de perf (A-05, TLX-078) — route empilée après l'envoi de la saisie.
 *
 * `key={id}` (ADR-58) : écran d'onglet masqué, jamais démonté. Sans clé, les candidats record
 * déjà validés sur une perf restaient masqués sur la suivante (`confirmed` rémanent).
 */
export default function PerfConfirmationRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PerfConfirmationScreen key={id} />;
}
