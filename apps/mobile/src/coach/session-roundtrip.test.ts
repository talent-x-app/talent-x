import { BlockType, LoadUnit } from '@talent-x/api-client';
import type { ExerciseNode } from '../sessions/exercises-doc';
import { nodesFromExercises, nodesToItems } from './session-builder-ui';

/**
 * Aller-retour du document de séance (TLX-259). Le test qui compte n'est pas « la durée
 * survit » mais **« le document est identique après une édition qui ne le touche pas »** :
 * hydrater le canvas éditable depuis `exercises`, resérialiser sans rien modifier, comparer.
 *
 * Le défaut d'origine : le coach changeait un **titre de séance** et l'app effaçait
 * `durationSeconds` de l'échauffement et du retour au calme. La séance sortait alors du
 * monitoring de charge (TLX-113) — `plannedDurationMinutes` rendait `null`, donc `sessionLoad`
 * aussi, donc ni ACWR ni monotonie ni contrainte. Silencieux et cumulatif.
 *
 * La cause n'est pas dans `composite-canvas` (ses commits font `{ ...warmup, notes }`, qui
 * préserve) ni à la **lecture** (`blockFromExercise` lit bien `durationSeconds`) : elle est à
 * la **sérialisation**. `blockToExercise` n'écrivait un champ de base que si
 * `isBaseFieldVisible(type, key)` — une règle d'**affichage** (TLX-94 : un param supplante un
 * champ de base redondant) réutilisée pour décider ce qu'on **écrit**. Tout champ masqué pour
 * un type était donc détruit à l'aller-retour, qu'il vienne de l'éditeur ou du document.
 */

/** Document riche : bornes durées, params hors spec, champs de base masqués par supplantation. */
const RICH_DOC: ExerciseNode[] = [
  {
    name: 'Échauffement',
    order: 0,
    type: BlockType.warmup,
    // `durationSeconds` est masqué sur warmup (supplanté par `stationSeconds`) — c'est
    // exactement le champ que l'édition effaçait, et celui dont dépend la charge.
    durationSeconds: 900,
    notes: 'Footing 12′ · gammes',
  },
  {
    name: '6 × 400m',
    order: 1,
    type: BlockType.interval,
    // `durationSeconds` masqué sur interval (supplanté par `workSeconds`).
    durationSeconds: 540,
    restSeconds: 120,
    params: {
      reps: 6,
      workSeconds: 90,
      recoverySeconds: 120,
      // Clé absente de la spec du type : un `params` est un conteneur **ouvert** (ADR-18).
      coachTag: 'seuil',
    },
  },
  {
    name: 'Développé couché',
    order: 2,
    type: BlockType.strength,
    sets: 4,
    reps: 8,
    load: { value: 80, unit: LoadUnit.kg },
    notes: 'tempo 3-1-1',
  },
  {
    name: 'Retour au calme',
    order: 3,
    type: BlockType.cooldown,
    durationSeconds: 600,
    notes: 'Étirements',
  },
];

/**
 * `nodesToItems` **renumérote** `order` en 1..N (compteur de parcours, ADR-27 règle 4) : un
 * document 0-basé revient 1-basé. C'est une réattribution positionnelle, pas une perte de
 * champ — et elle est hors du périmètre de TLX-259, qui porte sur les champs détruits. On la
 * neutralise donc ici pour que l'assertion d'identité parle bien de **contenu**.
 *
 * ⚠️ Ce n'est pas anodin pour autant : `resultForLeaf` (`exercises-doc.ts:168`) apparie les
 * résultats **par `order` d'abord**, nom en repli. Rééditer une séance 0-basée déjà réalisée
 * décale donc chaque `order` de +1 et fait correspondre chaque résultat à l'exercice suivant.
 * Signalé, non corrigé ici — changer la base de numérotation est un geste à part entière.
 */
function withoutOrder(nodes: readonly ExerciseNode[]): unknown[] {
  return nodes.map((node) => {
    const { order: _order, ...rest } = node as unknown as Record<string, unknown> & {
      order: number;
    };
    const items = (rest as { items?: readonly ExerciseNode[] }).items;
    return items ? { ...rest, items: withoutOrder(items) } : rest;
  });
}

describe('Aller-retour `exercises` sans modification (TLX-259)', () => {
  it('un document riche est rendu identique, champ pour champ', () => {
    const roundTripped = nodesToItems(nodesFromExercises(RICH_DOC));

    // L'assertion structurante du ticket : identité du document, pas survie d'un champ.
    expect(withoutOrder(roundTripped)).toEqual(withoutOrder(RICH_DOC));
    // La séquence, elle, est bien conservée.
    expect(roundTripped.map((n) => n.name)).toEqual(RICH_DOC.map((n) => n.name));
  });

  it('les durées des bornes survivent — c’est ce dont dépend la charge (TLX-113)', () => {
    const [warmup, , , cooldown] = nodesToItems(nodesFromExercises(RICH_DOC));

    expect(warmup).toMatchObject({ type: BlockType.warmup, durationSeconds: 900 });
    expect(cooldown).toMatchObject({ type: BlockType.cooldown, durationSeconds: 600 });
  });

  it('un champ de base masqué par supplantation (TLX-94) n’est pas détruit', () => {
    const [, interval] = nodesToItems(nodesFromExercises(RICH_DOC));

    // `workSeconds` supplante `durationSeconds` à l'**affichage** ; ça n'autorise pas à
    // effacer la valeur présente dans le document.
    expect(interval).toMatchObject({ durationSeconds: 540, restSeconds: 120 });
  });

  it('une clé de `params` hors spec est reconduite (conteneur ouvert, ADR-18)', () => {
    const [, interval] = nodesToItems(nodesFromExercises(RICH_DOC));

    expect((interval as { params?: Record<string, unknown> }).params).toMatchObject({
      reps: 6,
      workSeconds: 90,
      coachTag: 'seuil',
    });
  });

  it('une édition réelle est appliquée sans emporter les champs voisins', () => {
    const nodes = nodesFromExercises(RICH_DOC);
    // Le geste du scénario QA-02.6, transposé au bloc : renommer, rien d'autre.
    nodes[0] = { ...nodes[0], name: 'Échauffement long' } as (typeof nodes)[0];
    const [warmup] = nodesToItems(nodes);

    expect(warmup).toEqual({
      name: 'Échauffement long',
      order: 1, // renuméroté 1..N par `nodesToItems` — cf. `withoutOrder` ci-dessus
      type: BlockType.warmup,
      durationSeconds: 900,
      notes: 'Footing 12′ · gammes',
    });
  });

  it('vider un champ **visible** l’efface bien — la conservation n’est pas un gel', () => {
    const nodes = nodesFromExercises(RICH_DOC);
    // `sets` est visible sur strength : le modèle éditable en est propriétaire.
    nodes[2] = { ...nodes[2], sets: '' } as (typeof nodes)[2];
    const [, , strength] = nodesToItems(nodes);

    expect(strength).not.toHaveProperty('sets');
    expect(strength).toMatchObject({ reps: 8, name: 'Développé couché' });
  });
});
