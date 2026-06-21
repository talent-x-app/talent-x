import type { BlockType } from '@talent-x/api-client';
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
    blockType: 'sprint' as BlockType,
    effortLabel: 'Sprint',
  },
  {
    key: 'hurdles',
    label: 'Haies',
    tagline: 'Épreuve, hauteur, espacement, rythme d’appuis',
    icon: 'bar-chart-2',
    blockType: 'hurdles' as BlockType,
    effortLabel: 'Passage de haies',
  },
  {
    key: 'endurance',
    label: 'Demi-fond / Endurance',
    tagline: 'Distances ou durées, % VMA, allure cible',
    icon: 'activity',
    blockType: 'endurance' as BlockType,
    effortLabel: 'Course',
  },
  {
    key: 'jumps',
    label: 'Sauts',
    tagline: 'Longueur, triple, hauteur, perche',
    icon: 'trending-up',
    blockType: 'jumps' as BlockType,
    effortLabel: 'Saut',
  },
  {
    key: 'throws',
    label: 'Lancers',
    tagline: 'Poids, disque, javelot, marteau',
    icon: 'target',
    blockType: 'throws' as BlockType,
    effortLabel: 'Lancer',
  },
  {
    key: 'strength',
    label: 'Renforcement / PPG',
    tagline: 'Musculation et préparation physique générale',
    icon: 'box',
    blockType: 'strength' as BlockType,
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
// Clés en littéraux (valeurs de l'enum `BlockType`, string enum) → aucune référence à l'OBJET
// `BlockType` au chargement du module : ce module est tiré transitivement par la ligne de séance
// partagée (athlete-session-ui), y compris dans des tests qui moquent `@talent-x/api-client` sans
// exposer `BlockType`. Le typage `Record<string, …>` garde la lecture défensive.
export const BLOCK_TYPE_TO_DISCIPLINE: Partial<Record<string, DisciplineKey>> = {
  sprint: 'sprint',
  hurdles: 'hurdles',
  endurance: 'endurance',
  interval: 'endurance',
  jumps: 'jumps',
  vertical_jumps: 'jumps',
  throws: 'throws',
  // ADR-41 §6 — Renforcement / PPG : `strength` (muscu) et `core` (PPG) → même carte `strength`.
  strength: 'strength',
  core: 'strength',
};

/**
 * Discipline d'un `BlockType` (stocké en chaîne dans le contrat `exercises`). Lecture défensive :
 * un type inconnu / non porteur de discipline (`warmup`/`cooldown`/`custom`) renvoie `null`.
 */
export function disciplineForBlockType(type: string | undefined | null): DisciplineKey | null {
  if (type == null) return null;
  return BLOCK_TYPE_TO_DISCIPLINE[type as BlockType] ?? null;
}
