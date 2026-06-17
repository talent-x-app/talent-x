import { type ReactNode } from 'react';
import type { EditableNode } from './session-builder-ui';
import type { DisciplineKey } from './discipline-assistants';
import { SprintEffortCanvas } from './sprint-effort-card';
import { HurdlesEffortCanvas } from './hurdles-effort-card';
import { EnduranceEffortCanvas } from './endurance-effort-card';
import { JumpsEffortCanvas } from './jumps-effort-card';
import { ThrowsEffortCanvas } from './throws-effort-card';
import { StrengthEffortCanvas } from './strength-effort-card';

/**
 * Contexte fourni à chaque entrée du registre `DISCIPLINE_CANVAS`. `embedded` (ADR-42 §2,
 * additif, défaut `false`) est **transmis** à la carte d'effort : masque l'en-tête KPI et les
 * barres échauffement/retour au calme quand la carte est rendue comme **segment** d'un canvas
 * composite. Non fourni → carte standalone strictement inchangée.
 */
export type CanvasCtx = {
  nodes: EditableNode[];
  setNodes: (n: EditableNode[]) => void;
  embedded?: boolean;
};

/**
 * Canvas d'effort dédié par discipline (ADR-39, TLX-165→167). Chaque discipline a sa carte
 * fidèle à la maquette ; le sélecteur de modèle vit **dans** chaque carte de série (plus de barre
 * de presets globale). La séance produite reste éditable en C-05 sans perte.
 *
 * Réutilisé par `SessionBuilderScreen` (édition, route vers la carte dédiée dès que la discipline
 * est inférée du contenu existant, ADR-40 §2) et par `DisciplineAssistantScreen` (création). Chaque
 * entrée **transmet** `embedded` à sa carte (ADR-42 §2) : `undefined` → standalone inchangé.
 */
// Les 6 disciplines ont désormais leur carte d'effort dédiée (ADR-41 phase B, TLX-173) : la carte
// `StrengthEffortCanvas` (Renforcement / PPG) complète le registre. `Record` plein → plus de repli
// générique nécessaire à la création comme à l'édition par inférence.
export const DISCIPLINE_CANVAS: Record<DisciplineKey, (ctx: CanvasCtx) => ReactNode> = {
  sprint: ({ nodes, setNodes, embedded }) => (
    <SprintEffortCanvas nodes={nodes} onChange={setNodes} embedded={embedded} />
  ),
  hurdles: ({ nodes, setNodes, embedded }) => (
    <HurdlesEffortCanvas nodes={nodes} onChange={setNodes} embedded={embedded} />
  ),
  endurance: ({ nodes, setNodes, embedded }) => (
    <EnduranceEffortCanvas nodes={nodes} onChange={setNodes} embedded={embedded} />
  ),
  jumps: ({ nodes, setNodes, embedded }) => (
    <JumpsEffortCanvas nodes={nodes} onChange={setNodes} embedded={embedded} />
  ),
  throws: ({ nodes, setNodes, embedded }) => (
    <ThrowsEffortCanvas nodes={nodes} onChange={setNodes} embedded={embedded} />
  ),
  strength: ({ nodes, setNodes, embedded }) => (
    <StrengthEffortCanvas nodes={nodes} onChange={setNodes} embedded={embedded} />
  ),
};
