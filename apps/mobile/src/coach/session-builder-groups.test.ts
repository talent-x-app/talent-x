import { BlockType } from '@talent-x/api-client';
import {
  findFirstNodeIssue,
  isBaseFieldVisible,
  makeEmptyBlock,
  makeEmptyGroup,
  nodesToItems,
  type EditableBlock,
  type EditableGroup,
  type EditableNode,
} from './session-builder-ui';

/** Bloc éditable de test (champs en chaînes). */
function block(over: Partial<EditableBlock> & { name: string }): EditableBlock {
  return { ...makeEmptyBlock(), ...over };
}

/** Groupe éditable de test. */
function grp(over: Partial<EditableGroup> & { items: EditableBlock[] }): EditableGroup {
  return { ...makeEmptyGroup(), ...over };
}

describe('isBaseFieldVisible — masquage sets en groupe (ADR-27 règle 6)', () => {
  it('sets visible hors groupe, masqué en groupe ; les autres règles TLX-94 inchangées', () => {
    expect(isBaseFieldVisible(BlockType.strength, 'sets', false)).toBe(true);
    expect(isBaseFieldVisible(BlockType.strength, 'sets', true)).toBe(false);
    // reps supplanté par le param sprint « reps » quel que soit le contexte.
    expect(isBaseFieldVisible(BlockType.sprint, 'reps', false)).toBe(false);
    expect(isBaseFieldVisible(BlockType.sprint, 'reps', true)).toBe(false);
  });
});

describe('nodesToItems — sérialisation v3 (order global, ADR-27 règle 4)', () => {
  it('order global unique en parcours de lecture : groupe puis membres', () => {
    const nodes: EditableNode[] = [
      block({ name: 'Échauffement', type: BlockType.warmup }),
      grp({
        name: 'Contraste',
        groupType: 'superset',
        rounds: '3',
        restBetweenItemsSeconds: '30',
        restBetweenRoundsSeconds: '180',
        items: [
          block({ name: 'Squat', type: BlockType.strength, sets: '5', reps: '3' }),
          block({ name: 'Bonds' }),
        ],
      }),
      grp({
        name: 'Série',
        groupType: 'series',
        rounds: '3',
        items: [
          block({ name: 'Ligne droite', type: BlockType.sprint, params: { distanceMeters: '60' } }),
        ],
      }),
    ];
    const items = nodesToItems(nodes);

    // Échauffement = order 1 ; groupe Contraste = 2 ; membres = 3, 4 ; groupe Série = 5 ; membre = 6.
    expect(items[0]).toMatchObject({ name: 'Échauffement', order: 1 });
    const contraste = items[1] as {
      kind: string;
      order: number;
      rounds: number;
      items: { name: string; order: number }[];
    };
    expect(contraste).toMatchObject({
      kind: 'group',
      order: 2,
      groupType: 'superset',
      rounds: 3,
      restBetweenItemsSeconds: 30,
      restBetweenRoundsSeconds: 180,
    });
    expect(contraste.items.map((i) => [i.name, i.order])).toEqual([
      ['Squat', 3],
      ['Bonds', 4],
    ]);
    const serie = items[2] as { order: number; items: { name: string; order: number }[] };
    expect(serie.order).toBe(5);
    expect(serie.items[0]).toMatchObject({ name: 'Ligne droite', order: 6 });
  });

  it('membre de groupe : `sets` masqué à la sérialisation (porté par rounds)', () => {
    const items = nodesToItems([
      grp({
        name: 'G',
        rounds: '3',
        items: [block({ name: 'Squat', type: BlockType.strength, sets: '5', reps: '3' })],
      }),
    ]);
    const member = (items[0] as unknown as { items: Record<string, unknown>[] }).items[0];
    expect(member).not.toHaveProperty('sets'); // masqué (ADR-27)
    expect(member).toMatchObject({ reps: 3 }); // les autres champs restent
  });

  it('rounds vide → 1 tour (contrat ≥ 1) ; r/R/notes optionnels omis si vides', () => {
    const items = nodesToItems([grp({ name: 'G', rounds: '', items: [block({ name: 'A' })] })]);
    const g = items[0] as unknown as Record<string, unknown>;
    expect(g.rounds).toBe(1);
    expect(g).not.toHaveProperty('restBetweenItemsSeconds');
    expect(g).not.toHaveProperty('restBetweenRoundsSeconds');
    expect(g).not.toHaveProperty('notes');
  });
});

describe('findFirstNodeIssue — validation traversante (ADR-27)', () => {
  it('valide une séance correcte (bloc + groupe)', () => {
    expect(
      findFirstNodeIssue([
        block({ name: 'Footing' }),
        grp({ name: 'G', rounds: '3', items: [block({ name: 'Squat' })] }),
      ]),
    ).toBeNull();
  });

  it('bloc de premier niveau sans nom → numéro de feuille', () => {
    expect(findFirstNodeIssue([block({ name: '' })])?.message).toMatch(/bloc 1/i);
  });

  it('groupe sans nom', () => {
    expect(findFirstNodeIssue([grp({ name: '', items: [block({ name: 'A' })] })])?.message).toMatch(
      /nom.*groupe|groupe.*nom/i,
    );
  });

  it('membre de groupe sans nom → numéro de feuille global (TLX-91 couvre les groupes)', () => {
    const issue = findFirstNodeIssue([
      block({ name: 'Footing' }), // feuille 1
      grp({ name: 'G', items: [block({ name: 'Squat' }), block({ name: '' })] }), // feuilles 2, 3
    ]);
    expect(issue?.message).toMatch(/bloc 3/i);
  });

  it('param requis manquant sur un membre de groupe (sprint sans distance)', () => {
    const issue = findFirstNodeIssue([
      grp({
        name: 'Série',
        items: [block({ name: '8 × 60m', type: BlockType.sprint })], // distanceMeters requis, absent
      }),
    ]);
    expect(issue?.message).toMatch(/distance/i);
  });
});
