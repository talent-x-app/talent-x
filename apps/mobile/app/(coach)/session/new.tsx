import { SessionStatus } from '@talent-x/api-client';
import { useLocalSearchParams } from 'expo-router';
import { SessionBuilderScreen } from '../../../src/coach/SessionBuilderScreen';

/**
 * Création d'une séance (C-05, TLX-052) — route empilée hors tab bar. Le paramètre
 * optionnel `status=template` ouvre le constructeur en **mode modèle** (C-10, ADR-29).
 */
export default function NewSessionRoute() {
  const { status } = useLocalSearchParams<{ status?: string }>();
  const initialStatus = status === SessionStatus.template ? SessionStatus.template : undefined;
  return <SessionBuilderScreen initialStatus={initialStatus} />;
}
