import { BlockType, type Exercise, type ExerciseGroup } from '@talent-x/api-client';
import { blocksFromExercises } from './session-builder-ui';

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

describe('blocksFromExercises — hydratation v3 (ADR-27, Lot 2)', () => {
  it('aplatit les membres de groupe en blocs éditables (jamais perdus, sans UI d’écriture)', () => {
    const blocks = blocksFromExercises([
      ex({ name: 'Échauffement', order: 1 }),
      group({
        order: 2,
        items: [
          ex({ name: 'Squat', order: 2, sets: 5, reps: 3 }),
          ex({ name: 'Fentes', order: 3 }),
        ],
      }),
    ]);
    // 3 feuilles (1 simple + 2 membres), triées par order — le groupe ne devient pas un bloc vide.
    expect(blocks.map((b) => b.name)).toEqual(['Échauffement', 'Squat', 'Fentes']);
    const squat = blocks.find((b) => b.name === 'Squat');
    expect(squat?.sets).toBe('5');
    expect(squat?.reps).toBe('3');
  });

  it('document v2 plat inchangé', () => {
    const blocks = blocksFromExercises([ex({ name: 'A', order: 2 }), ex({ name: 'B', order: 1 })]);
    expect(blocks.map((b) => b.name)).toEqual(['B', 'A']);
  });
});
