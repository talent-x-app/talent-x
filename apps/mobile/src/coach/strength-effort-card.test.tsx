import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { BlockType, LoadUnit } from '@talent-x/api-client';
import { StrengthEffortCanvas } from './strength-effort-card';
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

/**
 * Tests du canvas Renforcement / PPG (ADR-41, TLX-173) — table Muscu (séries/reps/charge),
 * cible ≈kg dérivée du %1RM, bascule Mode → PPG (stations), presets, ajout/suppression.
 */

function setup(initial: EditableNode[]) {
  const ref: { nodes: EditableNode[] } = { nodes: initial };
  function Harness() {
    const [nodes, setNodes] = useState(initial);
    ref.nodes = nodes;
    return <StrengthEffortCanvas nodes={nodes} onChange={setNodes} />;
  }
  render(<Harness />);
  return {
    nodes: () => ref.nodes,
    blocks: () =>
      ref.nodes.filter(
        (n) => !isEditableGroup(n) && (n.type === BlockType.strength || n.type === BlockType.core),
      ) as EditableBlock[],
    groups: () => ref.nodes.filter((n) => isEditableGroup(n)) as EditableGroup[],
  };
}

function muscuBlock(): EditableBlock {
  const b = makeBlock({
    type: BlockType.strength,
    name: 'Squat',
    sets: '4',
    reps: '5',
    params: { exerciseKey: 'squat', tempo: '31X1' },
  });
  b.loadValue = '85';
  b.loadUnit = LoadUnit.percent_1rm;
  return b;
}

function muscuCanvas(): EditableNode[] {
  return [makeWarmupBlock(), muscuBlock(), makeCooldownBlock()];
}

function ppgCanvas(): EditableNode[] {
  return [
    makeWarmupBlock(),
    makeSeriesGroup({
      name: 'Circuit PPG',
      groupType: 'circuit',
      rounds: '3',
      restBetweenRoundsSeconds: '60',
      items: [
        makeBlock({
          type: BlockType.core,
          name: 'Pompes',
          durationSeconds: '40',
          restSeconds: '20',
        }),
      ],
    }),
    makeCooldownBlock(),
  ];
}

describe('StrengthEffortCanvas', () => {
  it('rend le canvas, l’en-tête et les barres échauffement/RAC', () => {
    setup(muscuCanvas());
    expect(screen.getByTestId('strength-effort-canvas')).toBeTruthy();
    expect(screen.getByTestId('strength-canvas-summary')).toBeTruthy();
    expect(screen.getByTestId('warmup-bar')).toBeTruthy();
    expect(screen.getByTestId('cooldown-bar')).toBeTruthy();
    expect(screen.getByTestId('series-card-0')).toBeTruthy();
  });

  it('édite séries / reps / charge sur la ligne Muscu', () => {
    const h = setup(muscuCanvas());
    act(() => fireEvent.changeText(screen.getByTestId('series-card-0-ex-0-sets'), '5'));
    act(() => fireEvent.changeText(screen.getByTestId('series-card-0-ex-0-reps'), '3'));
    act(() => fireEvent.changeText(screen.getByTestId('series-card-0-ex-0-load'), '90'));
    const b = h.blocks()[0];
    expect(b.sets).toBe('5');
    expect(b.reps).toBe('3');
    expect(b.loadValue).toBe('90');
  });

  it('mode %1RM : affiche la cible ≈ kg dérivée (squat 85 % → ≈ 119 kg)', () => {
    setup(muscuCanvas());
    expect(screen.getByText(/≈ 119 kg/)).toBeTruthy();
  });

  it('bascule la charge en kg → met à jour loadUnit de la ligne', () => {
    const h = setup(muscuCanvas());
    act(() => fireEvent.press(screen.getByTestId('series-card-0-loadmode-kg')));
    expect(h.blocks()[0].loadUnit).toBe(LoadUnit.kg);
  });

  it('bascule la charge en RPE → loadUnit null + params.rpe', () => {
    const h = setup(muscuCanvas());
    act(() => fireEvent.press(screen.getByTestId('series-card-0-loadmode-rpe')));
    const b = h.blocks()[0];
    expect(b.loadUnit).toBeNull();
    expect(b.params.rpe).toBeTruthy();
  });

  it('bascule Mode → PPG : remplace par un groupe de stations core', () => {
    const h = setup(muscuCanvas());
    act(() => fireEvent.press(screen.getByTestId('series-card-0-mode-ppg')));
    expect(h.groups()).toHaveLength(1);
    expect(h.groups()[0].items[0].type).toBe(BlockType.core);
    expect(screen.getByTestId('series-card-0-add-station')).toBeTruthy();
  });

  it('édite le travail et la récup d’une station PPG', () => {
    const h = setup(ppgCanvas());
    act(() => fireEvent.changeText(screen.getByTestId('series-card-0-station-0-work'), '50'));
    act(() => fireEvent.changeText(screen.getByTestId('series-card-0-station-0-rec'), '25'));
    expect(h.groups()[0].items[0].durationSeconds).toBe('50');
    expect(h.groups()[0].items[0].restSeconds).toBe('25');
  });

  it('applique un preset (circuit_ppg) → reconstruit la carte en PPG', () => {
    const h = setup(muscuCanvas());
    act(() => fireEvent.press(screen.getByTestId('series-card-0-preset')));
    act(() => fireEvent.press(screen.getByTestId('series-card-0-preset-circuit_ppg')));
    expect(h.groups()).toHaveLength(1);
    expect(h.groups()[0].items.length).toBeGreaterThan(1);
  });

  it('ajoute puis supprime un exercice Muscu', () => {
    const h = setup(muscuCanvas());
    act(() => fireEvent.press(screen.getByTestId('series-card-0-add-exercise')));
    expect(h.blocks()).toHaveLength(2);
    act(() => fireEvent.press(screen.getByTestId('series-card-0-ex-1-del')));
    expect(h.blocks()).toHaveLength(1);
  });

  it('ajoute un bloc de travail (nouvelle carte PPG distincte)', () => {
    const h = setup(muscuCanvas());
    act(() => fireEvent.press(screen.getByTestId('strength-add-series')));
    expect(screen.getByTestId('series-card-1')).toBeTruthy();
    // La nouvelle carte est un groupe PPG (nœud distinct, ne fusionne pas avec le bloc Muscu).
    expect(h.groups()).toHaveLength(1);
  });
});
