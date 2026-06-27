import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { BlockType } from '@talent-x/api-client';
import { GenericEffortCanvas } from './generic-effort-card';
import {
  isEditableGroup,
  makeBlock,
  type EditableBlock,
  type EditableNode,
} from './session-builder-ui';

/**
 * Tests de la carte d'effort générique « Libre » (ADR-52, TLX-193) : grammaire de série (sélecteur
 * Type d'effort + exercices + Tours), feuilles de type `custom` stockées en champs de base
 * (round-trip), mode encart, ajout/suppression.
 */

function setup(initial: EditableNode[], embedded = false) {
  const ref: { nodes: EditableNode[] } = { nodes: initial };
  function Harness() {
    const [nodes, setNodes] = useState(initial);
    ref.nodes = nodes;
    return <GenericEffortCanvas nodes={nodes} onChange={setNodes} embedded={embedded} />;
  }
  render(<Harness />);
  return { nodes: () => ref.nodes };
}

function customLeaf(name = ''): EditableBlock {
  return makeBlock({ type: BlockType.custom, name });
}

describe('GenericEffortCanvas (ADR-52)', () => {
  it('rend une série libre : sélecteur Type d’effort + 1 exercice + Tours', () => {
    setup([customLeaf('Gainage')]);
    expect(screen.getByTestId('generic-effort-canvas')).toBeOnTheScreen();
    expect(screen.getByTestId('series-card-0')).toBeOnTheScreen();
    expect(screen.getByTestId('series-card-0-kind')).toBeOnTheScreen();
    expect(screen.getByTestId('series-card-0-rounds')).toBeOnTheScreen();
    expect(screen.getByTestId('series-card-0-ex-0-name').props.value).toBe('Gainage');
  });

  it('mode encart : masque l’en-tête KPI (chrome porté par le composite)', () => {
    setup([customLeaf('Gainage')], true);
    expect(screen.queryByTestId('generic-canvas-summary')).toBeNull();
  });

  it('choisir un Type d’effort pré-remplit la série (feuilles custom, champs de base)', () => {
    const h = setup([customLeaf('')]);
    fireEvent.press(screen.getByTestId('series-card-0-kind'));
    fireEvent.press(screen.getByTestId('series-card-0-kind-reps'));

    // La série est un groupe dont les exercices restent de type custom (jamais ré-inférés).
    const node = h.nodes()[0];
    expect(isEditableGroup(node)).toBe(true);
    if (isEditableGroup(node)) {
      expect(node.items.every((b) => b.type === BlockType.custom)).toBe(true);
      // Le modèle « Répétitions » pré-remplit reps + récup (champs de base, round-trip).
      expect(node.items[0].reps).not.toBe('');
    }
  });

  it('éditer un exercice écrit dans les champs de base (round-trip)', () => {
    const h = setup([customLeaf('')]);
    fireEvent.changeText(screen.getByTestId('series-card-0-ex-0-name'), 'Planche');
    fireEvent.changeText(screen.getByTestId('series-card-0-ex-0-work'), '45');

    const node = h.nodes()[0];
    expect(isEditableGroup(node)).toBe(true);
    if (isEditableGroup(node)) {
      expect(node.items[0]).toMatchObject({
        type: BlockType.custom,
        name: 'Planche',
        durationSeconds: '45',
      });
    }
  });

  it('ajoute un exercice à la série puis une nouvelle série', () => {
    const h = setup([customLeaf('Planche')]);
    fireEvent.press(screen.getByTestId('series-card-0-add-exercise'));
    expect(screen.getByTestId('series-card-0-ex-1-name')).toBeOnTheScreen();

    fireEvent.press(screen.getByTestId('generic-add-series'));
    expect(screen.getByTestId('series-card-1')).toBeOnTheScreen();
    expect(h.nodes()).toHaveLength(2);
  });

  it('supprime une série (≥ 2) et garde la dernière', () => {
    const h = setup([customLeaf('A')]);
    fireEvent.press(screen.getByTestId('generic-add-series'));
    expect(h.nodes()).toHaveLength(2);
    fireEvent.press(screen.getByTestId('series-card-1-del'));
    expect(h.nodes()).toHaveLength(1);
  });
});
