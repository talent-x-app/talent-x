import { useMemo } from 'react';
import { SessionBuilderScreen } from './SessionBuilderScreen';
import { disciplineConfig } from './discipline-assistants';
import { assistantPresets, assistantSeed } from './assistant-presets';

/**
 * Assistant de création par discipline (ADR-38, TLX-155→159). Mince surcouche du constructeur
 * générique (C-05) : pré-amorce le canvas en **séries** de la discipline et expose ses presets.
 * Comme c'est le même `SessionBuilderScreen`, la séance produite reste **éditable en C-05 sans
 * perte** et part au même `POST /sessions`. Une discipline inconnue retombe sur le constructeur
 * vierge (lecture défensive du paramètre de route).
 */
export function DisciplineAssistantScreen({ discipline }: { discipline?: string }) {
  const cfg = disciplineConfig(discipline);
  const seed = useMemo(() => () => assistantSeed(discipline), [discipline]);
  const presets = useMemo(() => assistantPresets(discipline), [discipline]);

  if (!cfg) return <SessionBuilderScreen />;
  return (
    <SessionBuilderScreen titleText={`Assistant ${cfg.label}`} seed={seed} presets={presets} />
  );
}
