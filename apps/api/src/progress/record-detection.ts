import { BlockType, isExerciseGroup, type ExerciseDto } from '../sessions/dto/exercises.dto';
import type { ExerciseResultDto } from '../assignments/dto/results.dto';

/**
 * Détection de records personnels (ADR-20) — module pur. Dérive la **clé d'épreuve**
 * des blocs typés (ADR-18) et extrait la **meilleure mesure** de la performance
 * (results v2, ADR-19) par épreuve :
 *
 * | BlockType | event_key | Mesure | Sens |
 * |---|---|---|---|
 * | sprint, hurdles, endurance, interval | `{type}:{distanceMeters}m` | min timeSeconds | min |
 * | jumps | `jumps` | max distanceMeters | max |
 * | vertical_jumps | `vertical:{high\|pole}` | max distanceMeters (hauteur) | max |
 * | throws | `throws:{implementKg}kg` | max distanceMeters | max |
 *
 * Lecture défensive (philosophie TLX-062) : param manquant (distance de course, poids
 * d'engin), mesure absente ou essai `failed` → pas de candidat, jamais d'exception.
 */
export interface EventBest {
  eventKey: string;
  label: string;
  unit: 's' | 'm';
  direction: 'min' | 'max';
  value: number;
}

const TIMED_TYPES = new Set<string>([
  BlockType.Sprint,
  BlockType.Hurdles,
  BlockType.Endurance,
  BlockType.Interval,
]);

/** Familles d'épreuve adressables (clé canonique) — partagées auto (détection) ↔ manuel (ADR-32). */
export type EventFamily =
  | 'sprint'
  | 'hurdles'
  | 'endurance'
  | 'interval'
  | 'jumps'
  | 'vertical'
  | 'throws';

const TIMED_FAMILIES = new Set<EventFamily>(['sprint', 'hurdles', 'endurance', 'interval']);

function positive(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

/**
 * Fabrique **canonique** d'épreuve (ADR-20/32) : compose `eventKey`/`label`/`unit`/`direction`
 * à partir d'une **famille** et de ses paramètres. Source de vérité unique partagée par la
 * détection (blocs typés) et les records manuels — garantit la **même clé** pour la même épreuve.
 * `undefined` si la famille / le paramètre requis est invalide.
 */
export function composeEvent(
  family: EventFamily,
  params: { distanceMeters?: number; implementKg?: number; discipline?: string },
): Omit<EventBest, 'value'> | undefined {
  if (TIMED_FAMILIES.has(family)) {
    const distance = positive(params.distanceMeters);
    if (distance == null) return undefined;
    const suffix = family === 'hurdles' ? ' haies' : '';
    return {
      eventKey: `${family}:${distance}m`,
      label: `${distance} m${suffix}`,
      unit: 's',
      direction: 'min',
    };
  }
  if (family === 'jumps') {
    return { eventKey: 'jumps', label: 'Saut', unit: 'm', direction: 'max' };
  }
  if (family === 'vertical') {
    if (params.discipline !== 'high' && params.discipline !== 'pole') return undefined;
    return params.discipline === 'pole'
      ? { eventKey: 'vertical:pole', label: 'Perche', unit: 'm', direction: 'max' }
      : { eventKey: 'vertical:high', label: 'Hauteur', unit: 'm', direction: 'max' };
  }
  if (family === 'throws') {
    const implementKg = positive(params.implementKg);
    if (implementKg == null) return undefined;
    return {
      eventKey: `throws:${implementKg}kg`,
      label: `Lancer ${implementKg} kg`,
      unit: 'm',
      direction: 'max',
    };
  }
  return undefined;
}

/** Param numérique strictement positif du conteneur libre `params` (ADR-18). */
function param(exercise: Partial<ExerciseDto>, key: string): number | undefined {
  return positive((exercise.params as Record<string, unknown> | undefined)?.[key]);
}

/**
 * Épreuve d'un bloc typé — `undefined` si le bloc n'est pas éligible au record. Délègue la
 * composition de la clé à `composeEvent` (fabrique canonique partagée avec les records manuels).
 */
export function eventForExercise(
  exercise: Partial<ExerciseDto>,
): Omit<EventBest, 'value'> | undefined {
  const type = exercise.type;
  if (type && TIMED_TYPES.has(type)) {
    return composeEvent(type as EventFamily, { distanceMeters: param(exercise, 'distanceMeters') });
  }
  if (type === BlockType.Jumps) {
    return composeEvent('jumps', {});
  }
  if (type === BlockType.VerticalJumps) {
    // Saut vertical (ADR-25) : hauteur (défaut) ou perche, distingués par le param libre `discipline`.
    const pole = (exercise.params as Record<string, unknown> | undefined)?.discipline === 'pole';
    return composeEvent('vertical', { discipline: pole ? 'pole' : 'high' });
  }
  if (type === BlockType.Throws) {
    return composeEvent('throws', { implementKg: param(exercise, 'implementKg') });
  }
  return undefined;
}

/**
 * Aplatit les **feuilles** (exercices) d'un document `exercises` : les membres des
 * groupes (ADR-27) remontent au premier niveau, l'ordre de lecture est préservé.
 * Lecture défensive : un nœud `null` ou un groupe sans `items` exploitable est ignoré.
 */
export function flattenExerciseLeaves(items: readonly unknown[]): Partial<ExerciseDto>[] {
  const leaves: Partial<ExerciseDto>[] = [];
  for (const node of items ?? []) {
    if (isExerciseGroup(node)) {
      for (const child of node.items ?? []) leaves.push(child as Partial<ExerciseDto>);
    } else if (node != null) {
      leaves.push(node as Partial<ExerciseDto>);
    }
  }
  return leaves;
}

/**
 * Meilleures mesures de la performance par épreuve. Les blocs sont d'abord **aplatis**
 * (feuilles des groupes, ADR-27), puis joints aux résultats par **`order` d'abord**
 * (repli `exerciseName`) : les groupes successifs dupliquent légitimement les noms
 * (ADR-27 règle 4 amendée), seul l'`order` — unique sur les feuilles — désambiguïse.
 * Plusieurs blocs sur la même épreuve gardent la meilleure marque.
 */
export function bestMeasuresByEvent(
  exercises: readonly unknown[],
  results: Partial<ExerciseResultDto>[],
): EventBest[] {
  const leaves = flattenExerciseLeaves(exercises);
  const best = new Map<string, EventBest>();
  for (const item of results) {
    const exercise =
      leaves.find((ex) => ex.order != null && ex.order === item.order) ??
      leaves.find((ex) => ex.name != null && ex.name === item.exerciseName);
    if (!exercise) continue;
    const event = eventForExercise(exercise);
    if (!event) continue;

    for (const set of item.setResults ?? []) {
      if (set.failed) continue;
      const measure = event.unit === 's' ? set.timeSeconds : set.distanceMeters;
      if (typeof measure !== 'number' || !Number.isFinite(measure) || measure <= 0) continue;
      const current = best.get(event.eventKey);
      if (!current || isBetter(measure, current.value, event.direction)) {
        best.set(event.eventKey, { ...event, value: measure });
      }
    }
  }
  return [...best.values()];
}

/** `candidate` est-il strictement meilleur que `reference` dans le sens de l'épreuve ? */
export function isBetter(candidate: number, reference: number, direction: 'min' | 'max'): boolean {
  return direction === 'min' ? candidate < reference : candidate > reference;
}
