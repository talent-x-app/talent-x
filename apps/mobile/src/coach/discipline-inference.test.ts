import { BlockType } from '@talent-x/api-client';
import {
  hasAnyRecognizedBlock,
  inferDiscipline,
  disciplineOfNode,
  segmentSession,
} from './discipline-inference';
import {
  makeBlock,
  makeEmptyBlock,
  makeSeriesGroup,
  type EditableNode,
} from './session-builder-ui';

jest.mock('@talent-x/api-client', () => ({
  BlockType: {
    strength: 'strength',
    interval: 'interval',
    sprint: 'sprint',
    endurance: 'endurance',
    hurdles: 'hurdles',
    jumps: 'jumps',
    vertical_jumps: 'vertical_jumps',
    throws: 'throws',
    core: 'core',
    warmup: 'warmup',
    cooldown: 'cooldown',
    custom: 'custom',
  },
  LoadUnit: { kg: 'kg', lb: 'lb', percent_1rm: 'percent_1rm', bodyweight: 'bodyweight' },
}));

describe('inferDiscipline (ADR-40 §2)', () => {
  it('série pure sprint → sprint', () => {
    const nodes: EditableNode[] = [
      makeSeriesGroup({ items: [makeBlock({ type: BlockType.sprint })] }),
    ];
    expect(inferDiscipline(nodes)).toBe('sprint');
  });

  it('série pure haies → hurdles', () => {
    const nodes: EditableNode[] = [
      makeSeriesGroup({ items: [makeBlock({ type: BlockType.hurdles })] }),
    ];
    expect(inferDiscipline(nodes)).toBe('hurdles');
  });

  it('série pure endurance (endurance + interval) → endurance', () => {
    const nodes: EditableNode[] = [
      makeSeriesGroup({
        items: [makeBlock({ type: BlockType.endurance }), makeBlock({ type: BlockType.interval })],
      }),
    ];
    expect(inferDiscipline(nodes)).toBe('endurance');
  });

  it('série pure sauts (jumps + vertical_jumps) → jumps', () => {
    const nodes: EditableNode[] = [
      makeSeriesGroup({
        items: [
          makeBlock({ type: BlockType.jumps }),
          makeBlock({ type: BlockType.vertical_jumps }),
        ],
      }),
    ];
    expect(inferDiscipline(nodes)).toBe('jumps');
  });

  it('série pure lancers → throws', () => {
    const nodes: EditableNode[] = [
      makeSeriesGroup({ items: [makeBlock({ type: BlockType.throws })] }),
    ];
    expect(inferDiscipline(nodes)).toBe('throws');
  });

  it('série pure musculation (strength) → strength (ADR-41)', () => {
    const nodes: EditableNode[] = [
      makeSeriesGroup({ items: [makeBlock({ type: BlockType.strength })] }),
    ];
    expect(inferDiscipline(nodes)).toBe('strength');
  });

  it('PPG pur (core) → strength (ADR-41)', () => {
    const nodes: EditableNode[] = [
      makeSeriesGroup({ items: [makeBlock({ type: BlockType.core })] }),
    ];
    expect(inferDiscipline(nodes)).toBe('strength');
  });

  it('mélange strength + core → strength (même discipline, ADR-41)', () => {
    const nodes: EditableNode[] = [
      makeBlock({ type: BlockType.strength }),
      makeSeriesGroup({
        groupType: 'circuit',
        items: [makeBlock({ type: BlockType.core }), makeBlock({ type: BlockType.core })],
      }),
    ];
    expect(inferDiscipline(nodes)).toBe('strength');
  });

  it('mélange strength + sprint → null', () => {
    const nodes: EditableNode[] = [
      makeBlock({ type: BlockType.strength }),
      makeSeriesGroup({ items: [makeBlock({ type: BlockType.sprint })] }),
    ];
    expect(inferDiscipline(nodes)).toBeNull();
  });

  it('mélange custom + strength → null', () => {
    const nodes: EditableNode[] = [
      makeBlock({ type: BlockType.custom }),
      makeBlock({ type: BlockType.strength }),
    ];
    expect(inferDiscipline(nodes)).toBeNull();
  });

  it('mélange sprint + haies → null', () => {
    const nodes: EditableNode[] = [
      makeSeriesGroup({ items: [makeBlock({ type: BlockType.sprint })] }),
      makeSeriesGroup({ items: [makeBlock({ type: BlockType.hurdles })] }),
    ];
    expect(inferDiscipline(nodes)).toBeNull();
  });

  it('bloc custom mêlé à des haies → null', () => {
    const nodes: EditableNode[] = [
      makeSeriesGroup({ items: [makeBlock({ type: BlockType.hurdles })] }),
      makeBlock({ type: BlockType.custom }),
    ];
    expect(inferDiscipline(nodes)).toBeNull();
  });

  it('échauffement + haies + retour au calme → hurdles (warmup/cooldown ignorés)', () => {
    const nodes: EditableNode[] = [
      makeBlock({ type: BlockType.warmup }),
      makeSeriesGroup({ items: [makeBlock({ type: BlockType.hurdles })] }),
      makeBlock({ type: BlockType.cooldown }),
    ];
    expect(inferDiscipline(nodes)).toBe('hurdles');
  });

  it('séance vide/par défaut (bloc custom seul) → null', () => {
    const nodes: EditableNode[] = [makeEmptyBlock()];
    expect(inferDiscipline(nodes)).toBeNull();
  });

  it('seulement warmup + cooldown (rien de significatif) → null', () => {
    const nodes: EditableNode[] = [
      makeBlock({ type: BlockType.warmup }),
      makeBlock({ type: BlockType.cooldown }),
    ];
    expect(inferDiscipline(nodes)).toBeNull();
  });
});

describe('hasAnyRecognizedBlock (bandeau « édition avancée », ADR-40 §2)', () => {
  it('mélange de disciplines reconnues → true', () => {
    const nodes: EditableNode[] = [
      makeSeriesGroup({ items: [makeBlock({ type: BlockType.sprint })] }),
      makeBlock({ type: BlockType.custom }),
    ];
    expect(hasAnyRecognizedBlock(nodes)).toBe(true);
  });

  it('aucun bloc reconnu (custom seul) → false', () => {
    expect(hasAnyRecognizedBlock([makeEmptyBlock()])).toBe(false);
  });

  it('warmup/cooldown seuls → false', () => {
    const nodes: EditableNode[] = [
      makeBlock({ type: BlockType.warmup }),
      makeBlock({ type: BlockType.cooldown }),
    ];
    expect(hasAnyRecognizedBlock(nodes)).toBe(false);
  });
});

describe('disciplineOfNode (ADR-42 §1)', () => {
  it('bloc sprint → sprint', () => {
    expect(disciplineOfNode(makeBlock({ type: BlockType.sprint }))).toBe('sprint');
  });

  it('bloc custom → null', () => {
    expect(disciplineOfNode(makeBlock({ type: BlockType.custom }))).toBeNull();
  });

  it('warmup → null', () => {
    expect(disciplineOfNode(makeBlock({ type: BlockType.warmup }))).toBeNull();
  });

  it('groupe homogène sprint → sprint', () => {
    expect(
      disciplineOfNode(makeSeriesGroup({ items: [makeBlock({ type: BlockType.sprint })] })),
    ).toBe('sprint');
  });

  it('groupe mixte (sprint + haies) → null', () => {
    expect(
      disciplineOfNode(
        makeSeriesGroup({
          items: [makeBlock({ type: BlockType.sprint }), makeBlock({ type: BlockType.hurdles })],
        }),
      ),
    ).toBeNull();
  });
});

describe('segmentSession (ADR-42 §1)', () => {
  it('liste vide → []', () => {
    expect(segmentSession([])).toEqual([]);
  });

  it('run sprint pur → 1 segment discipline', () => {
    const nodes: EditableNode[] = [
      makeSeriesGroup({ items: [makeBlock({ type: BlockType.sprint })] }),
      makeSeriesGroup({ items: [makeBlock({ type: BlockType.sprint })] }),
    ];
    const segs = segmentSession(nodes);
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({ kind: 'discipline', discipline: 'sprint', start: 0, end: 2 });
    expect(segs[0].nodes).toHaveLength(2);
  });

  it('sprint puis strength → 2 segments discipline', () => {
    const nodes: EditableNode[] = [
      makeSeriesGroup({ items: [makeBlock({ type: BlockType.sprint })] }),
      makeBlock({ type: BlockType.strength }),
    ];
    const segs = segmentSession(nodes);
    expect(segs).toHaveLength(2);
    expect(segs[0]).toMatchObject({ kind: 'discipline', discipline: 'sprint' });
    expect(segs[1]).toMatchObject({ kind: 'discipline', discipline: 'strength' });
  });

  it('sprint, custom, haies → discipline/custom/discipline', () => {
    const nodes: EditableNode[] = [
      makeSeriesGroup({ items: [makeBlock({ type: BlockType.sprint })] }),
      makeBlock({ type: BlockType.custom }),
      makeSeriesGroup({ items: [makeBlock({ type: BlockType.hurdles })] }),
    ];
    const segs = segmentSession(nodes);
    expect(segs).toHaveLength(3);
    expect(segs[0]).toMatchObject({ kind: 'discipline', discipline: 'sprint', start: 0, end: 1 });
    expect(segs[1]).toMatchObject({ kind: 'custom', start: 1, end: 2 });
    expect(segs[2]).toMatchObject({ kind: 'discipline', discipline: 'hurdles', start: 2, end: 3 });
  });

  it('groupe de disciplines mixtes → 1 segment custom', () => {
    const nodes: EditableNode[] = [
      makeSeriesGroup({
        items: [makeBlock({ type: BlockType.sprint }), makeBlock({ type: BlockType.hurdles })],
      }),
    ];
    const segs = segmentSession(nodes);
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({ kind: 'custom', start: 0, end: 1 });
  });
});
