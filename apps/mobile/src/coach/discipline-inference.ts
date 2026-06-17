import { BlockType } from '@talent-x/api-client';
import { isEditableGroup, type EditableBlock, type EditableNode } from './session-builder-ui';
import type { DisciplineKey } from './discipline-assistants';

/**
 * Inférence de discipline (ADR-40 §2) : permet à `SessionBuilderScreen` de router vers la carte
 * d'effort dédiée **en édition** sans qu'une discipline soit stockée sur la séance (le contrat
 * `exercises` n'en a pas, ADR-38/39). On regarde les `BlockType` des blocs/séries de premier
 * niveau, en ignorant `warmup`/`cooldown` (jamais porteurs de la discipline) et en aplatissant
 * les membres d'un groupe (une série est un `group` dont les membres partagent la discipline).
 */

/** Discipline reconnue par `BlockType` parmi celles couvertes par les 5 cartes dédiées. */
const BLOCK_TYPE_TO_DISCIPLINE: Partial<Record<BlockType, DisciplineKey>> = {
  [BlockType.sprint]: 'sprint',
  [BlockType.hurdles]: 'hurdles',
  [BlockType.endurance]: 'endurance',
  [BlockType.interval]: 'endurance',
  [BlockType.jumps]: 'jumps',
  [BlockType.vertical_jumps]: 'jumps',
  [BlockType.throws]: 'throws',
};

/** Le bloc participe-t-il à l'inférence (hors échauffement/retour au calme) ? */
function isSignificantBlock(block: EditableBlock): boolean {
  return block.type !== BlockType.warmup && block.type !== BlockType.cooldown;
}

/**
 * Infère la discipline d'une séance depuis ses nœuds éditables : `sprint` / `hurdles` /
 * `endurance` / `jumps` / `throws` si **tous** les blocs significatifs (hors warmup/cooldown,
 * groupes aplatis) partagent la même discipline reconnue ; `null` sinon (mélange, type non
 * couvert — `custom`/`strength`/`core` — ou aucun bloc significatif).
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
    if (key == null) return null; // type non couvert (custom/strength/core...) → repli générique
    if (discipline == null) discipline = key;
    else if (discipline !== key) return null; // mélange de disciplines → repli générique
  }
  return discipline;
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
