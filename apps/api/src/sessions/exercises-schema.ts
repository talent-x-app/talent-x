/**
 * Version courante du contrat JSONB `exercises` des séances.
 *
 * **v3 = groupes d'exercices** (tours/séries, supersets/circuits) — cf. ADR-27 ;
 * v2 = blocs typés par discipline (ADR-18), v1 = blocs génériques. Le passage à v3
 * a été livré côté backend (DTO `ExerciseGroupDto`) et côté constructeur mobile, qui
 * sérialise déjà `schemaVersion: 3`.
 *
 * **Source unique côté API** : importée par tous les services qui sérialisent un
 * `ExercisesDoc` (séances + journal d'entraînement) → un seul point à incrémenter lors
 * d'une évolution de schéma, plus de littéral dupliqué. Le contrat
 * (`docs/talent-x-openapi.yaml`, schéma `ExercisesDoc`) reste la **source de vérité
 * documentaire** ; cette constante n'est que le défaut de sérialisation appliqué quand
 * le client omet `schemaVersion`.
 */
export const EXERCISES_SCHEMA_VERSION = 3;
