import { BlockType, type Exercise, type ExerciseGroup } from '@talent-x/api-client';
import {
  countLeaves,
  exerciseRenderRows,
  flattenLeaves,
  isExerciseGroup,
  leafRounds,
  resultForLeaf,
} from './exercises-doc';

const ex = (name: string, order: number, type: BlockType = BlockType.custom): Exercise => ({
  name,
  order,
  type,
});

const group = (over: Partial<ExerciseGroup> & { items: Exercise[] }): ExerciseGroup => ({
  kind: 'group',
  name: over.name ?? 'Bloc',
  order: over.order ?? 1,
  rounds: over.rounds ?? 1,
  ...over,
});

describe('isExerciseGroup', () => {
  it('distingue groupe et exercice, défensif sur null/undefined', () => {
    expect(isExerciseGroup(group({ items: [] }))).toBe(true);
    expect(isExerciseGroup(ex('Squat', 1))).toBe(false);
    expect(isExerciseGroup(null)).toBe(false);
    expect(isExerciseGroup(undefined)).toBe(false);
  });
});

describe('flattenLeaves / countLeaves', () => {
  it('aplatit les membres de groupe dans l’ordre de lecture', () => {
    const items = [
      ex('Échauffement', 1),
      group({ order: 2, items: [ex('Squat', 2), ex('Fentes', 3)] }),
      ex('Gainage', 4),
    ];
    expect(flattenLeaves(items).map((l) => l.name)).toEqual([
      'Échauffement',
      'Squat',
      'Fentes',
      'Gainage',
    ]);
    expect(countLeaves(items)).toBe(4);
  });

  it('défensif : items manquants / groupe vide', () => {
    expect(flattenLeaves(undefined)).toEqual([]);
    expect(countLeaves([group({ items: [] })])).toBe(0);
  });
});

describe('exerciseRenderRows', () => {
  it('intercale les en-têtes de groupe et indexe les feuilles à plat', () => {
    const rows = exerciseRenderRows([
      ex('Échauffement', 1),
      group({ order: 2, groupType: 'superset', items: [ex('Squat', 2), ex('Fentes', 3)] }),
    ]);
    expect(rows.map((r) => r.type)).toEqual(['leaf', 'group', 'leaf', 'leaf']);

    const leaves = rows.filter((r): r is Extract<typeof r, { type: 'leaf' }> => r.type === 'leaf');
    expect(leaves.map((l) => l.leafIndex)).toEqual([0, 1, 2]);
    // Superset → libellés A1/A2 ; bornes de groupe pour l'indentation.
    expect(leaves[1].memberLabel).toBe('A1');
    expect(leaves[1].firstInGroup).toBe(true);
    expect(leaves[2].memberLabel).toBe('A2');
    expect(leaves[2].lastInGroup).toBe(true);
    // Exercice hors groupe : pas de parent.
    expect(leaves[0].group).toBeUndefined();
  });

  it('groupe non-superset → libellés numériques', () => {
    const rows = exerciseRenderRows([group({ items: [ex('A', 1), ex('B', 2)] })]);
    const leaves = rows.filter((r): r is Extract<typeof r, { type: 'leaf' }> => r.type === 'leaf');
    expect(leaves.map((l) => l.memberLabel)).toEqual(['1', '2']);
  });
});

describe('leafRounds', () => {
  it('rounds du groupe (≥1), sinon undefined', () => {
    expect(leafRounds(group({ items: [], rounds: 3 }))).toBe(3);
    expect(leafRounds(group({ items: [], rounds: 0 }))).toBeUndefined();
    expect(leafRounds(undefined)).toBeUndefined();
  });
});

describe('resultForLeaf', () => {
  const results = [
    { exerciseName: 'Squat', order: 2, setResults: [{ set: 1, completed: true }] },
    { exerciseName: 'Squat', order: 5, setResults: [{ set: 1, completed: false }] },
  ];

  it('joint par order d’abord — désambiguïse les noms dupliqués entre groupes (ADR-27)', () => {
    expect(resultForLeaf(results, { name: 'Squat', order: 5 })?.setResults?.[0]?.completed).toBe(
      false,
    );
    expect(resultForLeaf(results, { name: 'Squat', order: 2 })?.setResults?.[0]?.completed).toBe(
      true,
    );
  });

  it('repli sur le nom quand l’order ne matche pas (perf v1 sans order)', () => {
    const v1 = [{ exerciseName: 'Squat', setResults: [{ set: 1, completed: true }] }];
    expect(resultForLeaf(v1, { name: 'Squat', order: 99 })).toBeDefined();
  });

  it('aucun match / results absents → undefined', () => {
    expect(resultForLeaf(results, { name: 'Développé', order: 9 })).toBeUndefined();
    expect(resultForLeaf(undefined, { name: 'Squat', order: 2 })).toBeUndefined();
  });
});
