import { BlockType } from '@talent-x/api-client';
import { hasAnyRecognizedBlock, inferDiscipline } from './discipline-inference';
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
