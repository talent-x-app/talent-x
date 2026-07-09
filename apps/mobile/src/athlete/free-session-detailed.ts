import {
  BlockType,
  type Exercise,
  type ExerciseGroup,
  type TrainingLogRequest,
} from '@talent-x/api-client';
import { assistantSeed } from '../coach/assistant-presets';
import { isEditableGroup, nodesToItems, type EditableNode } from '../coach/session-builder-ui';
import { EXERCISES_SCHEMA_VERSION } from '../sessions/exercises-doc';

/**
 * Journal libre — mode **assistant détaillé** (TLX-162, ADR-36/38) : module pur qui adapte les
 * canvas d'effort par discipline (ADR-39, réutilisés tels quels du coach) à la consignation d'une
 * séance libre multi-séries. Toujours `POST /athletes/me/training-log` (aucun nouveau contrat) :
 * les items sérialisés par `nodesToItems` (v3, groupes ADR-27) partent tels quels, et le doc
 * `results` requis marque chaque feuille **réalisée** (c'est un journal : la séance a eu lieu).
 * Les marques mesurées restent saisissables ensuite via « Modifier ma performance » sur la séance
 * créée (affectation `completed` + perf, ADR-36) — hors périmètre de la consignation.
 */

/**
 * Amorce du canvas pour une discipline : le seed de l'assistant coach, **sans** échauffement /
 * retour au calme (même filtre que le canvas composite ADR-42 — un journal consigne l'effort).
 */
export function detailedSeed(discipline: string): EditableNode[] {
  return assistantSeed(discipline).filter(
    (n) => isEditableGroup(n) || (n.type !== BlockType.warmup && n.type !== BlockType.cooldown),
  );
}

/** Feuilles (exercices) d'un doc sérialisé, groupes aplatis dans l'ordre de lecture. */
export function flattenLeaves(items: (Exercise | ExerciseGroup)[]): Exercise[] {
  const leaves: Exercise[] = [];
  for (const item of items) {
    if ('items' in item && Array.isArray(item.items)) {
      leaves.push(...item.items);
    } else {
      leaves.push(item as Exercise);
    }
  }
  return leaves;
}

/**
 * Corps `TrainingLogRequest` d'une séance libre multi-séries : exercices sérialisés du canvas +
 * résultats « réalisé » par feuille (doc requis par le contrat). `null` si le canvas ne porte
 * aucune feuille (rien à consigner).
 */
export function buildDetailedTrainingLog(opts: {
  title: string;
  date: string;
  nodes: EditableNode[];
  fallbackTitle: string;
  rpe?: string;
  notes?: string;
}): TrainingLogRequest | null {
  const items = nodesToItems(opts.nodes);
  const leaves = flattenLeaves(items);
  if (leaves.length === 0) return null;

  const body: TrainingLogRequest = {
    title: opts.title.trim() || opts.fallbackTitle,
    date: opts.date.trim(),
    exercises: {
      schemaVersion: EXERCISES_SCHEMA_VERSION,
      items,
    } as TrainingLogRequest['exercises'],
    results: {
      schemaVersion: 2,
      items: leaves.map((leaf) => ({
        exerciseName: leaf.name,
        order: leaf.order,
        setResults: [{ set: 1, completed: true }],
      })),
    } as TrainingLogRequest['results'],
  };
  if (opts.rpe?.trim()) body.rpe = Number(opts.rpe);
  if (opts.notes?.trim()) body.notes = opts.notes.trim();
  return body;
}
