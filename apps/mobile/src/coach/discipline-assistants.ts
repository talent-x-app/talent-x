import { BlockType } from '@talent-x/api-client';
import { Feather } from '@expo/vector-icons';

/**
 * Catalogue des **assistants de création par discipline** (ADR-38). Source unique partagée par
 * l'écran de choix « Nouvelle séance » (TLX-154) et les assistants dédiés (TLX-155→159) :
 * ajouter une discipline = ajouter une entrée ici. La discipline n'est **pas** un champ
 * persistant de la séance — elle reste dérivée des `BlockType` produits (cf. ADR-38 §1) ; ce
 * catalogue ne sert qu'à guider la création.
 */

/** Clé d'une discipline guidée (cartes de l'écran « Nouvelle séance »). */
export type DisciplineKey = 'sprint' | 'hurdles' | 'endurance' | 'jumps' | 'throws' | 'strength';

/** Configuration d'une carte/assistant de discipline. */
export interface DisciplineConfig {
  key: DisciplineKey;
  /** Libellé FR de la carte. */
  label: string;
  /** Sous-titre court décrivant ce que l'assistant prépare. */
  tagline: string;
  /** Icône Feather de la carte. */
  icon: keyof typeof Feather.glyphMap;
  /** Type de bloc majoritaire produit (les séries de l'assistant en héritent). */
  blockType: BlockType;
  /** Libellé d'un effort élémentaire dans une série (ex. « Sprint », « Course »). */
  effortLabel: string;
}

/** Les 6 disciplines de la maquette « Nouvelle séance » (ADR-38 §1, ADR-41). */
export const DISCIPLINES: DisciplineConfig[] = [
  {
    key: 'sprint',
    label: 'Sprint',
    tagline: 'Séries de sprints — distances, intensité, récupération',
    icon: 'zap',
    blockType: BlockType.sprint,
    effortLabel: 'Sprint',
  },
  {
    key: 'hurdles',
    label: 'Haies',
    tagline: 'Épreuve, hauteur, espacement, rythme d’appuis',
    icon: 'bar-chart-2',
    blockType: BlockType.hurdles,
    effortLabel: 'Passage de haies',
  },
  {
    key: 'endurance',
    label: 'Demi-fond / Endurance',
    tagline: 'Distances ou durées, % VMA, allure cible',
    icon: 'activity',
    blockType: BlockType.endurance,
    effortLabel: 'Course',
  },
  {
    key: 'jumps',
    label: 'Sauts',
    tagline: 'Longueur, triple, hauteur, perche',
    icon: 'trending-up',
    blockType: BlockType.jumps,
    effortLabel: 'Saut',
  },
  {
    key: 'throws',
    label: 'Lancers',
    tagline: 'Poids, disque, javelot, marteau',
    icon: 'target',
    blockType: BlockType.throws,
    effortLabel: 'Lancer',
  },
  {
    key: 'strength',
    label: 'Renforcement / PPG',
    tagline: 'Musculation et préparation physique générale',
    icon: 'box',
    blockType: BlockType.strength,
    effortLabel: 'Exercice',
  },
];

/** Configuration d'une discipline par sa clé, ou `undefined` si inconnue (lecture défensive). */
export function disciplineConfig(key: string | undefined): DisciplineConfig | undefined {
  return DISCIPLINES.find((d) => d.key === key);
}

/**
 * Fabrique **canonique** `BlockType → DisciplineKey` (ADR-38 §1, ADR-40/41) : source unique
 * partagée par l'inférence d'édition (`inferDiscipline`, ADR-40) et la dérivation de discipline
 * de séance côté lecture (`sessionDiscipline`, ADR-43 §2). `interval`/`vertical_jumps`/`core` se
 * replient sur la carte parente (endurance/jumps/strength) ; `warmup`/`cooldown`/`custom` ne sont
 * pas porteurs de discipline. Aligné sur la même grammaire que les records (ADR-20/41).
 */
export const BLOCK_TYPE_TO_DISCIPLINE: Partial<Record<BlockType, DisciplineKey>> = {
  [BlockType.sprint]: 'sprint',
  [BlockType.hurdles]: 'hurdles',
  [BlockType.endurance]: 'endurance',
  [BlockType.interval]: 'endurance',
  [BlockType.jumps]: 'jumps',
  [BlockType.vertical_jumps]: 'jumps',
  [BlockType.throws]: 'throws',
  // ADR-41 §6 — Renforcement / PPG : `strength` (muscu) et `core` (PPG) → même carte `strength`.
  [BlockType.strength]: 'strength',
  [BlockType.core]: 'strength',
};

/**
 * Discipline d'un `BlockType` (stocké en chaîne dans le contrat `exercises`). Lecture défensive :
 * un type inconnu / non porteur de discipline (`warmup`/`cooldown`/`custom`) renvoie `null`.
 */
export function disciplineForBlockType(type: string | undefined | null): DisciplineKey | null {
  if (type == null) return null;
  return BLOCK_TYPE_TO_DISCIPLINE[type as BlockType] ?? null;
}
