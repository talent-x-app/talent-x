import { useMemo } from 'react';
import { SessionBuilderScreen } from './SessionBuilderScreen';
import { disciplineConfig } from './discipline-assistants';
import { assistantSeed } from './assistant-presets';
import { DISCIPLINE_CANVAS } from './discipline-canvas';

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

  if (!cfg) return <SessionBuilderScreen />;
  return (
    <SessionBuilderScreen
      titleText={`Assistant ${cfg.label}`}
      seed={seed}
      // Toutes les disciplines ont désormais leur carte d'effort dédiée avec un sélecteur de
      // modèle interne → pas de barre de presets globale.
      presets={[]}
      // Carte dédiée si disponible ; sinon (ex. `strength` en phase A, ADR-41) constructeur C-05.
      renderCanvas={DISCIPLINE_CANVAS[cfg.key]}
    />
  );
}
