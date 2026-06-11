import { BlockType, type Exercise, type ExerciseGroup } from '@talent-x/api-client';
import { isEditableGroup, nodesFromExercises, nodesToItems } from './session-builder-ui';

const ex = (over: Partial<Exercise> & { name: string; order: number }): Exercise => ({
  type: BlockType.custom,
  ...over,
});

const group = (over: Partial<ExerciseGroup> & { items: Exercise[] }): ExerciseGroup => ({
  kind: 'group',
  name: over.name ?? 'Bloc',
  order: over.order ?? 1,
  rounds: over.rounds ?? 1,
  ...over,
});

describe('nodesFromExercises — hydratation v3 (ADR-27, Lot 3)', () => {
  it('préserve les groupes (round-trip, plus d’aplatissement)', () => {
    const nodes = nodesFromExercises([
      ex({ name: 'Échauffement', order: 1, type: BlockType.warmup }),
      group({
        name: 'Contraste',
        order: 2,
        groupType: 'superset',
        rounds: 3,
        restBetweenRoundsSeconds: 180,
        items: [
          ex({ name: 'Squat', order: 3, type: BlockType.strength, sets: 5, reps: 3 }),
          ex({ name: 'Bonds', order: 4 }),
        ],
      }),
    ]);

    expect(nodes).toHaveLength(2);
    expect(isEditableGroup(nodes[0])).toBe(false);
    const g = nodes[1];
    if (!isEditableGroup(g)) throw new Error('attendu : groupe');
    expect(g.name).toBe('Contraste');
    expect(g.groupType).toBe('superset');
    expect(g.rounds).toBe('3');
    expect(g.restBetweenRoundsSeconds).toBe('180');
    expect(g.items.map((b) => b.name)).toEqual(['Squat', 'Bonds']);
    // Le `sets` du membre est hydraté tel quel (masqué au rendu/sérialisation, pas perdu).
    expect(g.items[0].sets).toBe('5');
  });

  it('nœuds de premier niveau triés par order global (règle 4)', () => {
    const nodes = nodesFromExercises([
      ex({ name: 'B', order: 5 }),
      group({ name: 'G', order: 1, items: [ex({ name: 'X', order: 2 })] }),
    ]);
    // order : groupe (1) avant le bloc (5).
    expect(isEditableGroup(nodes[0])).toBe(true);
    expect((nodes[1] as { name: string }).name).toBe('B');
  });

  it('round-trip v3 : hydratation → sérialisation rend une structure équivalente', () => {
    // Forme canonique (telle que sérialisée) : `custom` sans `type`, aucun champ masqué.
    const items: (Exercise | ExerciseGroup)[] = [
      { name: 'Squat', order: 1, type: BlockType.strength, sets: 5, reps: 3 },
      {
        kind: 'group',
        name: 'Série',
        order: 2,
        groupType: 'series',
        rounds: 3,
        restBetweenRoundsSeconds: 300,
        items: [
          {
            name: 'Ligne droite',
            order: 3,
            type: BlockType.sprint,
            params: { distanceMeters: 60 },
          },
        ],
      },
    ];
    const out = nodesToItems(nodesFromExercises(items));
    expect(out).toEqual(items);
  });

  it('document v2 plat inchangé (pas de groupe)', () => {
    const nodes = nodesFromExercises([ex({ name: 'A', order: 2 }), ex({ name: 'B', order: 1 })]);
    expect(nodes.every((n) => !isEditableGroup(n))).toBe(true);
    expect((nodes[0] as { name: string }).name).toBe('B');
  });
});
