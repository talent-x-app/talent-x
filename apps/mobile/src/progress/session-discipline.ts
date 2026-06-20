import { disciplineForBlockType, type DisciplineKey } from '../coach/discipline-assistants';
import { flattenLeaves, type ExerciseNode } from '../sessions/exercises-doc';

/**
 * Dérivation de la **discipline** et de la **perf attendue** d'une séance (ADR-43 §2/§3) —
 * module **pur**, sans état ni I/O, partagé par le hub de groupe athlète (pastilles, tags,
 * filtres calendrier) et la ligne de séance compacte.
 *
 * Principe (ADR-43) : la discipline n'est **pas** un champ stocké sur `Session` (le contrat
 * `exercises` n'en a pas) ni la « perf requise » un flag — les deux se **dérivent des blocs
 * typés**, en réutilisant la fabrique canonique `BlockType → DisciplineKey`
 * (`discipline-assistants`, miroir d'`eventForExercise`/`inferDiscipline`, ADR-20/40). Une seule
 * source de vérité, cohérente avec les records ; zéro migration, zéro double saisie.
 *
 * On ne raisonne que sur les **feuilles** (`flattenLeaves` exclut déjà échauffement / retour au
 * calme, jamais porteurs de discipline — TLX-171).
 */

/** Discipline dérivée d'une séance : une famille reconnue, `mixed` (mélange) ou `none` (non typé). */
export type SessionDiscipline = DisciplineKey | 'mixed' | 'none';

/**
 * Discipline d'une séance = **famille dominante** de ses feuilles typées (ADR-43 §2) :
 * - `none` si aucune feuille n'est rattachable à une discipline (séance vide, uniquement
 *   `custom`, ou uniquement échauffement / retour au calme) ;
 * - la famille qui compte **strictement** le plus de feuilles ;
 * - `mixed` si plusieurs familles sont à parts comparables (égalité en tête).
 *
 * Les feuilles non typées (`custom`) ne votent pas pour une famille mais n'empêchent pas une
 * discipline dominante de se dégager.
 */
export function sessionDiscipline(items: readonly ExerciseNode[] | undefined): SessionDiscipline {
  const counts = new Map<DisciplineKey, number>();
  for (const leaf of flattenLeaves(items)) {
    const key = disciplineForBlockType(leaf.type as string);
    if (key == null) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  if (counts.size === 0) return 'none';

  let top: DisciplineKey | null = null;
  let topCount = 0;
  let tied = false;
  for (const [key, count] of counts) {
    if (count > topCount) {
      top = key;
      topCount = count;
      tied = false;
    } else if (count === topCount) {
      tied = true;
    }
  }
  return tied ? 'mixed' : (top as DisciplineKey);
}

/**
 * La séance **attend-elle une perf** (ADR-43 §3) ? Vrai ssi elle porte ≥ 1 bloc **mesurable**,
 * c.-à-d. au moins une feuille rattachée à une discipline reconnue — toutes adossées à un record
 * (chrono / distance / charge, ADR-20/41). Les phases (échauffement / RAC) et les blocs `custom`
 * ne sont pas mesurables. Aucun flag stocké : la dérivation suit le contenu réel de la séance.
 */
export function sessionExpectsPerformance(items: readonly ExerciseNode[] | undefined): boolean {
  return flattenLeaves(items).some((leaf) => disciplineForBlockType(leaf.type as string) != null);
}
