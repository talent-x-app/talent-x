import { SessionStatus } from '@talent-x/api-client';
import { useLocalSearchParams } from 'expo-router';
import { DisciplineAssistantScreen } from '../../../../src/coach/DisciplineAssistantScreen';

/**
 * Assistant de création par discipline (ADR-38, TLX-155→159) — route empilée hors tab bar, ouverte
 * depuis l'entrée de création (TLX-154). `status=template` (ADR-54) amorce un **modèle** : le statut
 * est transmis au constructeur, qui masque date/assignation et sauve en `template`.
 */
export default function DisciplineAssistantRoute() {
  const { discipline, status } = useLocalSearchParams<{ discipline?: string; status?: string }>();
  const initialStatus = status === SessionStatus.template ? SessionStatus.template : undefined;
  return <DisciplineAssistantScreen discipline={discipline} initialStatus={initialStatus} />;
}
