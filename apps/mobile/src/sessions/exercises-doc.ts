import { type Exercise, type ExerciseGroup, type ExerciseResult } from '@talent-x/api-client';

/**
 * Lecture d'un document `exercises` v3 (ADR-27) — module pur, partagé entre l'écran de
 * saisie athlète (A-03/A-04), la revue coach (C-08) et les compteurs/durée du brief.
 *
 * Un document v3 mêle des **exercices** simples (forme v2, sans `kind`) et des **groupes**
 * (`kind: "group"`) répétés en tours/séries. Les contrats `results`/records restent plats
 * (une entrée par **feuille**) : ce module aplatit les feuilles pour la saisie et expose
 * une liste de **lignes de rendu** où les en-têtes de groupe sont intercalés.
 */

/** Nœud du document : exercice simple ou groupe. */
export type ExerciseNode = Exercise | ExerciseGroup;

/** Le nœud est-il un groupe d'exercices (ADR-27) ? Lecture défensive. */
export function isExerciseGroup(node: ExerciseNode | null | undefined): node is ExerciseGroup {
  return node != null && (node as ExerciseGroup).kind === 'group';
}

/** Feuilles (exercices) à plat, ordre de lecture préservé (membres des groupes inclus). */
export function flattenLeaves(items: readonly ExerciseNode[] | undefined): Exercise[] {
  const leaves: Exercise[] = [];
  for (const node of items ?? []) {
    if (isExerciseGroup(node)) {
      for (const child of node.items ?? []) leaves.push(child);
    } else if (node != null) {
      leaves.push(node);
    }
  }
  return leaves;
}

/** Nombre de feuilles (un groupe de 3 exercices compte 3, pas 1). */
export function countLeaves(items: readonly ExerciseNode[] | undefined): number {
  return flattenLeaves(items).length;
}

/**
 * Ligne de rendu : un en-tête de groupe ou une feuille. Chaque feuille porte son
 * `leafIndex` (position à plat → aligne l'état de saisie `entries[leafIndex]`) et, si elle
 * est dans un groupe, son groupe parent + son rang (`memberLabel` = A1/A2 pour un superset,
 * 1/2 sinon), plus son rang de premier/dernier membre pour l'indentation.
 */
export type ExerciseRenderRow =
  | { type: 'group'; group: ExerciseGroup; key: string }
  | {
      type: 'leaf';
      key: string;
      exercise: Exercise;
      leafIndex: number;
      group?: ExerciseGroup;
      memberLabel?: string;
      firstInGroup: boolean;
      lastInGroup: boolean;
    };

/** Convertit les items d'un document en lignes de rendu (en-têtes de groupe intercalés). */
export function exerciseRenderRows(
  items: readonly ExerciseNode[] | undefined,
): ExerciseRenderRow[] {
  const rows: ExerciseRenderRow[] = [];
  let leafIndex = 0;
  let groupSeq = 0;
  for (const node of items ?? []) {
    if (isExerciseGroup(node)) {
      const members = node.items ?? [];
      const prefix = node.groupType === 'superset' ? 'A' : '';
      rows.push({ type: 'group', group: node, key: `group-${groupSeq}` });
      members.forEach((exercise, mi) => {
        rows.push({
          type: 'leaf',
          key: `leaf-${leafIndex}`,
          exercise,
          leafIndex: leafIndex++,
          group: node,
          memberLabel: `${prefix}${mi + 1}`,
          firstInGroup: mi === 0,
          lastInGroup: mi === members.length - 1,
        });
      });
      groupSeq++;
    } else if (node != null) {
      rows.push({
        type: 'leaf',
        key: `leaf-${leafIndex}`,
        exercise: node,
        leafIndex: leafIndex++,
        firstInGroup: false,
        lastInGroup: false,
      });
    }
  }
  return rows;
}

/** Tours de saisie d'une feuille = `rounds` du groupe parent (≥ 1), sinon `undefined`. */
export function leafRounds(group: ExerciseGroup | undefined): number | undefined {
  if (!group) return undefined;
  return group.rounds && group.rounds > 0 ? group.rounds : undefined;
}

/**
 * Résultat (results v2) correspondant à une feuille — jointure **`order` d'abord** (repli
 * `exerciseName`). Les groupes successifs dupliquent légitimement les noms (ADR-27 règle 4) :
 * seul l'`order`, unique sur les feuilles, désambiguïse.
 */
export function resultForLeaf(
  results: readonly ExerciseResult[] | undefined,
  leaf: Pick<Exercise, 'name' | 'order'>,
): ExerciseResult | undefined {
  if (!results) return undefined;
  return (
    results.find((r) => r.order != null && r.order === leaf.order) ??
    results.find((r) => r.exerciseName === leaf.name)
  );
}
