import { useMemo, type ReactNode } from 'react';
import { SessionBuilderScreen } from './SessionBuilderScreen';
import type { EditableNode } from './session-builder-ui';
import { disciplineConfig, type DisciplineKey } from './discipline-assistants';
import { assistantSeed } from './assistant-presets';
import { SprintEffortCanvas } from './sprint-effort-card';
import { HurdlesEffortCanvas } from './hurdles-effort-card';
import { EnduranceEffortCanvas } from './endurance-effort-card';
import { JumpsEffortCanvas } from './jumps-effort-card';
import { ThrowsEffortCanvas } from './throws-effort-card';

type CanvasCtx = {
  nodes: EditableNode[];
  setNodes: React.Dispatch<React.SetStateAction<EditableNode[]>>;
};

/**
 * Canvas d'effort dédié par discipline (ADR-39, TLX-165→167). Chaque discipline a sa carte
 * fidèle à la maquette ; le sélecteur de modèle vit **dans** chaque carte de série (plus de barre
 * de presets globale). La séance produite reste éditable en C-05 sans perte.
 */
const DISCIPLINE_CANVAS: Record<DisciplineKey, (ctx: CanvasCtx) => ReactNode> = {
  sprint: ({ nodes, setNodes }) => <SprintEffortCanvas nodes={nodes} onChange={setNodes} />,
  hurdles: ({ nodes, setNodes }) => <HurdlesEffortCanvas nodes={nodes} onChange={setNodes} />,
  endurance: ({ nodes, setNodes }) => <EnduranceEffortCanvas nodes={nodes} onChange={setNodes} />,
  jumps: ({ nodes, setNodes }) => <JumpsEffortCanvas nodes={nodes} onChange={setNodes} />,
  throws: ({ nodes, setNodes }) => <ThrowsEffortCanvas nodes={nodes} onChange={setNodes} />,
};

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
      renderCanvas={DISCIPLINE_CANVAS[cfg.key]}
    />
  );
}
