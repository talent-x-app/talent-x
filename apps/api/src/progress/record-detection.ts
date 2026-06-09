import { BlockType, type ExerciseDto } from '../sessions/dto/exercises.dto';
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

/** Param numérique strictement positif du conteneur libre `params` (ADR-18). */
function param(exercise: Partial<ExerciseDto>, key: string): number | undefined {
  const value = (exercise.params as Record<string, unknown> | undefined)?.[key];
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

/** Épreuve d'un bloc typé — `undefined` si le bloc n'est pas éligible au record. */
export function eventForExercise(
  exercise: Partial<ExerciseDto>,
): Omit<EventBest, 'value'> | undefined {
  const type = exercise.type;
  if (type && TIMED_TYPES.has(type)) {
    const distance = param(exercise, 'distanceMeters');
    if (distance == null) return undefined;
    const suffix = type === BlockType.Hurdles ? ' haies' : '';
    return {
      eventKey: `${type}:${distance}m`,
      label: `${distance} m${suffix}`,
      unit: 's',
      direction: 'min',
    };
  }
  if (type === BlockType.Jumps) {
    return { eventKey: 'jumps', label: 'Saut', unit: 'm', direction: 'max' };
  }
  if (type === BlockType.Throws) {
    const implementKg = param(exercise, 'implementKg');
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

/**
 * Meilleures mesures de la performance par épreuve. Les résultats sont joints aux blocs
 * par `exerciseName` puis `order` (même convention que le client, ADR-19) ; plusieurs
 * blocs sur la même épreuve gardent la meilleure marque.
 */
export function bestMeasuresByEvent(
  exercises: Partial<ExerciseDto>[],
  results: Partial<ExerciseResultDto>[],
): EventBest[] {
  const best = new Map<string, EventBest>();
  for (const item of results) {
    const exercise =
      exercises.find((ex) => ex.name != null && ex.name === item.exerciseName) ??
      exercises.find((ex) => ex.order != null && ex.order === item.order);
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
