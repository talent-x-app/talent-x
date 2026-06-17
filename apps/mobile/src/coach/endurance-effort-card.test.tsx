import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { BlockType } from '@talent-x/api-client';
import { EnduranceEffortCanvas } from './endurance-effort-card';
import {
  isEditableGroup,
  makeBlock,
  makeSeriesGroup,
  type EditableGroup,
  type EditableNode,
} from './session-builder-ui';

function setup(initial: EditableNode[]) {
  const ref: { nodes: EditableNode[] } = { nodes: initial };
  function Harness() {
    const [nodes, setNodes] = useState(initial);
    ref.nodes = nodes;
    return <EnduranceEffortCanvas nodes={nodes} onChange={setNodes} />;
  }
  render(<Harness />);
  return { groups: () => ref.nodes.filter((n) => isEditableGroup(n)) as EditableGroup[] };
}

/**
 * Tests du canvas Demi-fond / Endurance (ADR-39, TLX-167) — double unité distance/durée,
 * référentiel d'intensité, type de récup, presets.
 */

function makeSerie(unit: 'distance' | 'duration' = 'distance'): EditableGroup {
  return makeSeriesGroup({
    name: 'Série de course',
    rounds: '3',
    restBetweenRoundsSeconds: '0',
    items: [
      makeBlock({
        type: unit === 'duration' ? BlockType.interval : BlockType.endurance,
        name: 'Course',
        params: {
          distanceMeters: '1000',
          ...(unit === 'duration' ? { workSeconds: '60' } : {}),
          recoverySeconds: '120',
          recoveryType: 'active',
          intensityMode: 'vma',
          percentVma: '90',
        },
      }),
    ],
  });
}

describe('EnduranceEffortCanvas', () => {
  it('affiche le canvas sans barres Échauffement/RAC', () => {
    setup([makeSerie()]);
    expect(screen.getByTestId('endurance-effort-canvas')).toBeTruthy();
    expect(screen.queryByTestId('warmup-bar')).toBeNull();
    expect(screen.queryByTestId('cooldown-bar')).toBeNull();
    expect(screen.getByText(/Volume/)).toBeTruthy();
  });

  it('met à jour la distance d’un effort (mode distance)', () => {
    const h = setup([makeSerie('distance')]);
    act(() => fireEvent.changeText(screen.getByTestId('series-card-0-effort-0-dist'), '2000'));
    expect(h.groups()[0].items[0].params.distanceMeters).toBe('2000');
  });

  it('bascule en mode durée → type interval + colonne effort (s)', () => {
    const h = setup([makeSerie('distance')]);
    act(() => fireEvent.press(screen.getByTestId('series-card-0-unit-duration')));
    const g = h.groups()[0];
    expect(g.items[0].type).toBe(BlockType.interval);
    expect(g.items[0].params.workSeconds).toBeTruthy();
  });

  it('change le référentiel d’intensité (allure) et écrit la bonne clé', () => {
    const h = setup([makeSerie('distance')]);
    act(() => fireEvent.press(screen.getByTestId('series-card-0-imode-pace')));
    // La cellule d'intensité écrit désormais paceSecondsPerKm.
    act(() => fireEvent.changeText(screen.getByTestId('series-card-0-effort-0-int'), '300'));
    expect(h.groups()[0].items[0].params.paceSecondsPerKm).toBe('300');
  });

  it('change le référentiel d’intensité (allure spécifique) et écrit la distance + l’allure', () => {
    const h = setup([makeSerie('distance')]);
    act(() => fireEvent.press(screen.getByTestId('series-card-0-imode-spec_pace')));
    act(() => fireEvent.press(screen.getByTestId('series-card-0-specdist-800')));
    expect(h.groups()[0].items[0].params.specDistance).toBe('800');
    act(() => fireEvent.changeText(screen.getByTestId('series-card-0-effort-0-int'), '180'));
    expect(h.groups()[0].items[0].params.paceSecondsPerKm).toBe('180');
  });

  it('change le référentiel d’intensité (zone cardio) et écrit la zone nommée (Z2–Z5)', () => {
    const h = setup([makeSerie('distance')]);
    act(() => fireEvent.press(screen.getByTestId('series-card-0-imode-zone')));
    act(() => fireEvent.press(screen.getByTestId('series-card-0-hrzone-z3')));
    expect(h.groups()[0].items[0].params.hrZone).toBe('z3');
  });

  it('change le type de récupération (passive)', () => {
    const h = setup([makeSerie()]);
    act(() => fireEvent.press(screen.getByTestId('series-card-0-rec-passive')));
    expect(h.groups()[0].items[0].params.recoveryType).toBe('passive');
  });

  it('applique un preset (VMA 30/30) dans la carte', () => {
    const h = setup([makeSerie()]);
    act(() => fireEvent.press(screen.getByTestId('series-card-0-preset')));
    act(() => fireEvent.press(screen.getByTestId('series-card-0-preset-vma_short')));
    const g = h.groups()[0];
    expect(g.rounds).toBe('10');
    expect(g.items[0].type).toBe(BlockType.interval);
  });

  it('ajoute un effort puis une série', () => {
    const h = setup([makeSerie()]);
    act(() => fireEvent.press(screen.getByTestId('series-card-0-add-effort')));
    expect(h.groups()[0].items).toHaveLength(2);
    act(() => fireEvent.press(screen.getByTestId('endurance-add-series')));
    expect(h.groups()).toHaveLength(2);
  });
});
