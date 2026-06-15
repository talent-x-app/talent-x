import { SessionStatus } from '@talent-x/api-client';
import { useLocalSearchParams } from 'expo-router';
import { SessionBuilderScreen } from '../../../src/coach/SessionBuilderScreen';
import { NewSessionScreen } from '../../../src/coach/NewSessionScreen';

/**
 * Entrée de création de séance (C-05). Par défaut, affiche l'écran de **choix de discipline**
 * (ADR-38, TLX-154). Deux raccourcis court-circuitent ce choix vers le constructeur générique :
 * `status=template` (mode modèle, C-10/ADR-29) et `mode=custom` (option « Personnalisé »).
 */
export default function NewSessionRoute() {
  const { status, mode } = useLocalSearchParams<{ status?: string; mode?: string }>();
  const isTemplate = status === SessionStatus.template;
  if (isTemplate || mode === 'custom') {
    return <SessionBuilderScreen initialStatus={isTemplate ? SessionStatus.template : undefined} />;
  }
  return <NewSessionScreen />;
}
