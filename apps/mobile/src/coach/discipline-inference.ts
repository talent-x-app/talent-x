import { BlockType } from '@talent-x/api-client';
import { isEditableGroup, type EditableBlock, type EditableNode } from './session-builder-ui';
import { BLOCK_TYPE_TO_DISCIPLINE, type DisciplineKey } from './discipline-assistants';

/**
 * Inférence de discipline (ADR-40 §2) : permet à `SessionBuilderScreen` de router vers la carte
 * d'effort dédiée **en édition** sans qu'une discipline soit stockée sur la séance (le contrat
 * `exercises` n'en a pas, ADR-38/39). On regarde les `BlockType` des blocs/séries de premier
 * niveau, en ignorant `warmup`/`cooldown` (jamais porteurs de la discipline) et en aplatissant
 * les membres d'un groupe (une série est un `group` dont les membres partagent la discipline).
 * La fabrique `BlockType → DisciplineKey` est mutualisée avec la dérivation de lecture
 * (`sessionDiscipline`, ADR-43 §2) via `discipline-assistants` — une seule source de vérité.
 */

/** Le bloc participe-t-il à l'inférence (hors échauffement/retour au calme) ? */
function isSignificantBlock(block: EditableBlock): boolean {
  return block.type !== BlockType.warmup && block.type !== BlockType.cooldown;
}

/**
 * Infère la discipline d'une séance depuis ses nœuds éditables : `sprint` / `hurdles` /
 * `endurance` / `jumps` / `throws` / `strength` si **tous** les blocs significatifs (hors
 * warmup/cooldown, groupes aplatis) partagent la même discipline reconnue ; `null` sinon
 * (mélange, type non couvert — `custom` — ou aucun bloc significatif). Depuis ADR-41, `strength`
 * et `core` sont couverts (→ `'strength'`) ; seul `custom` reste non couvert.
 */
export function inferDiscipline(nodes: EditableNode[]): DisciplineKey | null {
  const significant: EditableBlock[] = [];
  for (const node of nodes) {
    if (isEditableGroup(node)) {
      significant.push(...node.items.filter(isSignificantBlock));
    } else if (isSignificantBlock(node)) {
      significant.push(node);
    }
  }

  if (significant.length === 0) return null;

  let discipline: DisciplineKey | null = null;
  for (const block of significant) {
    const key = BLOCK_TYPE_TO_DISCIPLINE[block.type];
    if (key == null) return null; // type non couvert (custom) → repli générique
    if (discipline == null) discipline = key;
    else if (discipline !== key) return null; // mélange de disciplines → repli générique
  }
  return discipline;
}

/**
 * Discipline d'un **nœud unique** (ADR-42 §1) — base de la segmentation du canvas composite.
 * - Bloc : mappé via `BLOCK_TYPE_TO_DISCIPLINE` (warmup/cooldown → `null` ; les appelants les
 *   ont normalement déjà retirés via `splitEffortNodes`).
 * - Groupe : on inspecte ses blocs significatifs — si **tous** partagent la même discipline
 *   reconnue → cette clé ; sinon (groupe mixte, custom, ou vide) → `null`.
 */
export function disciplineOfNode(node: EditableNode): DisciplineKey | null {
  if (isEditableGroup(node)) {
    const significant = node.items.filter(isSignificantBlock);
    if (significant.length === 0) return null;
    let discipline: DisciplineKey | null = null;
    for (const block of significant) {
      const key = BLOCK_TYPE_TO_DISCIPLINE[block.type];
      if (key == null) return null;
      if (discipline == null) discipline = key;
      else if (discipline !== key) return null;
    }
    return discipline;
  }
  if (!isSignificantBlock(node)) return null;
  return BLOCK_TYPE_TO_DISCIPLINE[node.type] ?? null;
}

/** Segment du canvas composite (ADR-42 §1) : un run contigu de nœuds de même nature. */
export type Segment =
  | {
      kind: 'discipline';
      discipline: DisciplineKey;
      nodes: EditableNode[];
      start: number;
      end: number;
    }
  | { kind: 'custom'; nodes: EditableNode[]; start: number; end: number };

/**
 * Segmente une liste de nœuds (les **séries**, warmup/cooldown déjà extraits) en runs
 * **contigus maximaux** (ADR-42 §1) : nœuds consécutifs partageant la même discipline reconnue
 * (non `null`) → un segment `discipline` ; nœuds consécutifs de discipline `null` (custom /
 * inconnu / groupe mixte) → un segment `custom`. `start`/`end` sont des indices `[start, end)`
 * dans `nodes`.
 */
export function segmentSession(nodes: EditableNode[]): Segment[] {
  const segments: Segment[] = [];
  let i = 0;
  while (i < nodes.length) {
    const disc = disciplineOfNode(nodes[i]);
    const start = i;
    i += 1;
    while (i < nodes.length && disciplineOfNode(nodes[i]) === disc) i += 1;
    const slice = nodes.slice(start, i);
    if (disc == null) {
      segments.push({ kind: 'custom', nodes: slice, start, end: i });
    } else {
      segments.push({ kind: 'discipline', discipline: disc, nodes: slice, start, end: i });
    }
  }
  return segments;
}

/**
 * La séance contient-elle au moins un bloc significatif de discipline reconnue ? Sert au bandeau
 * « édition avancée » (ADR-40 §2) : affiché seulement quand l'inférence échoue **à cause d'un
 * mélange**, pas quand il n'y a rien à inférer (ex. un seul bloc `custom`).
 */
export function hasAnyRecognizedBlock(nodes: EditableNode[]): boolean {
  const significant: EditableBlock[] = [];
  for (const node of nodes) {
    if (isEditableGroup(node)) significant.push(...node.items.filter(isSignificantBlock));
    else if (isSignificantBlock(node)) significant.push(node);
  }
  return significant.some((b) => BLOCK_TYPE_TO_DISCIPLINE[b.type] != null);
}
