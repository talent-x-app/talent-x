import { SessionStatus } from '@talent-x/api-client';
import { useLocalSearchParams } from 'expo-router';
import { SessionBuilderScreen } from '../../../src/coach/SessionBuilderScreen';
import { NewSessionScreen } from '../../../src/coach/NewSessionScreen';

/**
 * Entrée de création (C-05). **Entrée unifiée** séance/modèle (ADR-54) : par défaut, affiche le
 * **sélecteur de discipline** (ADR-38, TLX-154), en mode séance ou **modèle** selon `status`. Seul
 * `mode=custom` (option « Composer ») court-circuite ce choix vers le constructeur générique — en
 * mode modèle si `status=template` (C-10/ADR-29). `status=template` **seul** ouvre donc le picker,
 * plus le builder (changement ADR-54 §D3) : les assistants deviennent accessibles aux modèles.
 */
export default function NewSessionRoute() {
  const { status, mode } = useLocalSearchParams<{ status?: string; mode?: string }>();
  const isTemplate = status === SessionStatus.template;
  if (mode === 'custom') {
    return <SessionBuilderScreen initialStatus={isTemplate ? SessionStatus.template : undefined} />;
  }
  return <NewSessionScreen asTemplate={isTemplate} />;
}
