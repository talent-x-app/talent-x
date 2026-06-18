import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { BlockType } from '@talent-x/api-client';
import { HurdlesEffortCanvas } from './hurdles-effort-card';
import {
  isEditableGroup,
  makeBlock,
  makeCooldownBlock,
  makeSeriesGroup,
  makeWarmupBlock,
  type EditableBlock,
  type EditableGroup,
  type EditableNode,
} from './session-builder-ui';

/** Monte le canvas dans un parent contrôlé (les éditions s'accumulent comme en vrai). */
function setup(initial: EditableNode[], embedded = false) {
  const ref: { nodes: EditableNode[] } = { nodes: initial };
  function Harness() {
    const [nodes, setNodes] = useState(initial);
    ref.nodes = nodes;
    return <HurdlesEffortCanvas nodes={nodes} onChange={setNodes} embedded={embedded} />;
  }
  render(<Harness />);
  return {
    groups: () => ref.nodes.filter((n) => isEditableGroup(n)) as EditableGroup[],
    nodes: () => ref.nodes,
  };
}

/**
 * Tests du canvas Haies (ADR-39, TLX-166) — structure maquette : Échauffement/RAC, cartes de
 * série, tableau de passages, params techniques partagés, presets.
 */

function makeSerie(
  opts: { rounds?: number; passes?: { distance: number; height: number; recovery: number }[] } = {},
): EditableGroup {
  const passes = opts.passes ?? [{ distance: 110, height: 106.7, recovery: 300 }];
  return makeSeriesGroup({
    name: 'Série de haies',
    rounds: String(opts.rounds ?? 4),
    restBetweenRoundsSeconds: '300',
    items: passes.map((p) =>
      makeBlock({
        type: BlockType.hurdles,
        name: '110mH',
        params: {
          event: '110mH',
          distanceMeters: String(p.distance),
          heightCm: String(p.height),
          rhythmSteps: '3',
          leadLeg: 'left',
          startType: 'blocks',
          intensityMode: 'percent_record',
          recoverySeconds: String(p.recovery),
        },
      }),
    ),
  });
}

function defaultNodes(): EditableNode[] {
  return [makeWarmupBlock(), makeSerie(), makeCooldownBlock()];
}

describe('HurdlesEffortCanvas', () => {
  it('affiche le canvas, les barres Échauffement/RAC et une carte par série', () => {
    setup(defaultNodes());
    expect(screen.getByTestId('hurdles-effort-canvas')).toBeTruthy();
    expect(screen.getByTestId('warmup-bar')).toBeTruthy();
    expect(screen.getByTestId('cooldown-bar')).toBeTruthy();
    expect(screen.getByTestId('series-card-0')).toBeTruthy();
    expect(screen.getByText(/Course haies/)).toBeTruthy();
  });

  it('crée les barres par défaut quand elles sont absentes des nodes', () => {
    setup([makeSerie()]);
    expect(screen.getByTestId('warmup-bar')).toBeTruthy();
    expect(screen.getByTestId('cooldown-bar')).toBeTruthy();
  });

  it("met à jour la distance et la hauteur d'un passage", () => {
    const h = setup(defaultNodes());
    act(() => fireEvent.changeText(screen.getByTestId('series-card-0-pass-0-dist'), '100'));
    act(() => fireEvent.changeText(screen.getByTestId('series-card-0-pass-0-height'), '84'));
    const g = h.groups()[0];
    expect(g.items[0].params.distanceMeters).toBe('100');
    expect(g.items[0].params.heightCm).toBe('84');
  });

  it('propage un param technique partagé (rythme) à tous les passages', () => {
    const h = setup([
      makeSerie({
        passes: [
          { distance: 110, height: 106, recovery: 300 },
          { distance: 110, height: 106, recovery: 300 },
        ],
      }),
    ]);
    act(() => fireEvent.changeText(screen.getByTestId('series-card-0-rhythm'), '4'));
    expect(h.groups()[0].items.every((b: EditableBlock) => b.params.rhythmSteps === '4')).toBe(
      true,
    );
  });

  it('ajoute un passage', () => {
    const h = setup(defaultNodes());
    act(() => fireEvent.press(screen.getByTestId('series-card-0-add-pass')));
    expect(h.groups()[0].items).toHaveLength(2);
  });

  it('applique un preset dans la carte série', () => {
    const h = setup(defaultNodes());
    act(() => fireEvent.press(screen.getByTestId('series-card-0-preset')));
    act(() => fireEvent.press(screen.getByTestId('series-card-0-preset-h400')));
    const g = h.groups()[0];
    expect(g.rounds).toBe('3');
    expect(g.items[0].params.event).toBe('400mH');
  });

  it('change le référentiel d’intensité de la série', () => {
    const h = setup(defaultNodes());
    act(() => fireEvent.press(screen.getByTestId('series-card-0-imode-target_time')));
    expect(h.groups()[0].items[0].params.intensityMode).toBe('target_time');
  });

  it('ajoute une série', () => {
    const h = setup(defaultNodes());
    act(() => fireEvent.press(screen.getByTestId('hurdles-add-series')));
    expect(h.groups()).toHaveLength(2);
  });

  it('sélectionne la jambe d’attaque alternée', () => {
    const h = setup(defaultNodes());
    act(() => fireEvent.press(screen.getByTestId('series-card-0-lead-alt')));
    expect(h.groups()[0].items[0].params.leadLeg).toBe('alt');
  });

  it('affiche la cible calculée (≈) quand le référentiel est % du record', () => {
    const h = setup(defaultNodes());
    act(() => fireEvent.press(screen.getByTestId('series-card-0-sex-H')));
    act(() => fireEvent.changeText(screen.getByTestId('series-card-0-event'), '110mH'));
    act(() => fireEvent.changeText(screen.getByTestId('series-card-0-intensityValue'), '95'));
    expect(h.groups()[0].items[0].params.intensityValue).toBe('95');
    expect(screen.getByText(/≈ .* s sur la référence du module/)).toBeTruthy();
  });

  it('mode encart : séries + ajout rendus, en-tête KPI et barres écha/RAC masqués', () => {
    setup([makeSerie()], true);
    expect(screen.getByTestId('series-card-0')).toBeTruthy();
    expect(screen.getByTestId('hurdles-add-series')).toBeTruthy();
    expect(screen.queryByTestId('hurdles-canvas-summary')).toBeNull();
    expect(screen.queryByTestId('warmup-bar')).toBeNull();
    expect(screen.queryByTestId('cooldown-bar')).toBeNull();
  });
});
