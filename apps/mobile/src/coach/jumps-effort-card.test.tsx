import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { BlockType } from '@talent-x/api-client';
import { JumpsEffortCanvas } from './jumps-effort-card';
import {
  isEditableGroup,
  makeBlock,
  makeSeriesGroup,
  type EditableGroup,
  type EditableNode,
} from './session-builder-ui';

function setup(initial: EditableNode[], embedded = false) {
  const ref: { nodes: EditableNode[] } = { nodes: initial };
  function Harness() {
    const [nodes, setNodes] = useState(initial);
    ref.nodes = nodes;
    return <JumpsEffortCanvas nodes={nodes} onChange={setNodes} embedded={embedded} />;
  }
  render(<Harness />);
  return { groups: () => ref.nodes.filter((n) => isEditableGroup(n)) as EditableGroup[] };
}

/**
 * Tests du canvas Sauts (ADR-39, TLX-167) — deux rendus : horizontal (longueur/triple, tableau)
 * et vertical (hauteur/perche, grille de barres). Conversion de famille au changement de
 * discipline, presets.
 */

function makeHorizontal(): EditableGroup {
  return makeSeriesGroup({
    name: 'Série de sauts',
    rounds: '6',
    restBetweenRoundsSeconds: '240',
    items: [
      makeBlock({
        type: BlockType.jumps,
        name: 'Longueur',
        params: {
          discipline: 'long',
          approach: '18',
          approachUnit: 'steps',
          attempts: '1',
          takeoff: 'board',
          targetMode: 'percent_record',
        },
      }),
    ],
  });
}

function makeVertical(): EditableGroup {
  return makeSeriesGroup({
    name: 'Saut en hauteur',
    rounds: '1',
    items: [
      makeBlock({
        type: BlockType.vertical_jumps,
        name: 'Hauteur',
        params: {
          discipline: 'high',
          startHeightCm: '165',
          incrementCm: '5',
          bars: '6',
          attemptsPerBar: '3',
        },
      }),
    ],
  });
}

describe('JumpsEffortCanvas', () => {
  it('affiche le canvas et le compteur d’essais', () => {
    setup([makeHorizontal()]);
    expect(screen.getByTestId('jumps-effort-canvas')).toBeTruthy();
    expect(screen.getByText(/essais planifiés/)).toBeTruthy();
  });

  it('horizontal : édite l’élan et le nombre d’essais', () => {
    const h = setup([makeHorizontal()]);
    act(() => fireEvent.changeText(screen.getByTestId('series-card-0-jump-0-approach'), '12'));
    act(() => fireEvent.changeText(screen.getByTestId('series-card-0-jump-0-attempts'), '3'));
    const g = h.groups()[0];
    expect(g.items[0].params.approach).toBe('12');
    expect(g.items[0].params.attempts).toBe('3');
  });

  it('vertical : affiche la grille de barres dérivée (départ + montée)', () => {
    setup([makeVertical()]);
    expect(screen.getByTestId('series-card-0-bar-grid')).toBeTruthy();
    expect(screen.getByTestId('series-card-0-bar-0')).toHaveTextContent('165 cm');
    expect(screen.getByTestId('series-card-0-bar-1')).toHaveTextContent('170 cm');
    // Pas de tableau de sauts horizontaux en mode vertical.
    expect(screen.queryByTestId('series-card-0-add-jump')).toBeNull();
  });

  it('vertical : recalcule la grille au changement de montée', () => {
    const h = setup([makeVertical()]);
    act(() => fireEvent.changeText(screen.getByTestId('series-card-0-increment'), '10'));
    expect(h.groups()[0].items[0].params.incrementCm).toBe('10');
  });

  it('convertit horizontal → vertical au changement de discipline', () => {
    const h = setup([makeHorizontal()]);
    act(() => fireEvent.press(screen.getByTestId('series-card-0-disc-high')));
    const g = h.groups()[0];
    expect(g.items[0].type).toBe(BlockType.vertical_jumps);
    expect(g.items[0].params.discipline).toBe('high');
  });

  it('applique un preset (perche) dans la carte → bloc vertical', () => {
    const h = setup([makeHorizontal()]);
    act(() => fireEvent.press(screen.getByTestId('series-card-0-preset')));
    act(() => fireEvent.press(screen.getByTestId('series-card-0-preset-pole')));
    const g = h.groups()[0];
    expect(g.items[0].type).toBe(BlockType.vertical_jumps);
    expect(g.items[0].params.discipline).toBe('pole');
  });

  it('ajoute une série', () => {
    const h = setup([makeHorizontal()]);
    act(() => fireEvent.press(screen.getByTestId('jumps-add-series')));
    expect(h.groups()).toHaveLength(2);
  });

  it('mode encart : séries + ajout rendus, en-tête KPI et barres écha/RAC masqués', () => {
    setup([makeHorizontal()], true);
    expect(screen.getByTestId('series-card-0')).toBeTruthy();
    expect(screen.getByTestId('jumps-add-series')).toBeTruthy();
    expect(screen.queryByTestId('jumps-canvas-summary')).toBeNull();
    expect(screen.queryByTestId('warmup-bar')).toBeNull();
    expect(screen.queryByTestId('cooldown-bar')).toBeNull();
  });
});
