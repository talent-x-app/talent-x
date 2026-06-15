import { useLocalSearchParams } from 'expo-router';
import { DisciplineAssistantScreen } from '../../../../src/coach/DisciplineAssistantScreen';

/**
 * Assistant de création de séance par discipline (ADR-38, TLX-155→159) — route empilée hors
 * tab bar, ouverte depuis l'écran « Nouvelle séance » (TLX-154).
 */
export default function DisciplineAssistantRoute() {
  const { discipline } = useLocalSearchParams<{ discipline?: string }>();
  return <DisciplineAssistantScreen discipline={discipline} />;
}
