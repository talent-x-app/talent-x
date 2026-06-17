import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { BlockType } from '@talent-x/api-client';
import { CompositeCanvas } from './composite-canvas';
import {
  isEditableGroup,
  makeBlock,
  makeSeriesGroup,
  type EditableBlock,
  type EditableNode,
} from './session-builder-ui';

/**
 * Tests du canvas composite « Personnalisé » (ADR-42, TLX-177b/178) : segmentation par discipline
 * inférée, cadres de bloc + contrôles (▲▼🗑), rendu encart des cartes dédiées et de l'éditeur
 * générique pour les blocs Personnalisés, « + bloc » (seed dépouillé de l'échauffement / RAC).
 */

function setup(initial: EditableNode[]) {
  const ref: { nodes: EditableNode[] } = { nodes: initial };
  function Harness() {
    const [nodes, setNodes] = useState(initial);
    ref.nodes = nodes;
    return <CompositeCanvas nodes={nodes} onChange={setNodes} />;
  }
  render(<Harness />);
  return { nodes: () => ref.nodes };
}

function sprintSegment(): EditableNode {
  return makeSeriesGroup({
    name: 'Série de sprint',
    rounds: '1',
    items: [makeBlock({ type: BlockType.sprint, name: '60 m', params: { distanceMeters: '60' } })],
  });
}

function customBlock(): EditableBlock {
  return makeBlock({ type: BlockType.custom, name: 'Gainage libre' });
}

describe('CompositeCanvas (ADR-42)', () => {
  it('segmente une séance sprint + custom en deux blocs (Sprint / Personnalisé)', () => {
    setup([sprintSegment(), customBlock()]);

    expect(screen.getByTestId('composite-canvas-summary')).toBeOnTheScreen();
    expect(screen.getByTestId('composite-bloc-0')).toBeOnTheScreen();
    expect(screen.getByTestId('composite-bloc-1')).toBeOnTheScreen();
    // Bloc 0 : carte Sprint en encart.
    expect(screen.getByTestId('sprint-effort-canvas')).toBeOnTheScreen();
    // Bloc 1 : éditeur générique embarqué (segment Personnalisé).
    expect(screen.getByTestId('session-add-block')).toBeOnTheScreen();
  });

  it('état vide (aucune série) : header + « + bloc » sans cadre de bloc, sans crash', () => {
    setup([]);
    expect(screen.getByTestId('composite-canvas-summary')).toBeOnTheScreen();
    expect(screen.getByTestId('composite-add-bloc')).toBeOnTheScreen();
    expect(screen.queryByTestId('composite-bloc-0')).toBeNull();
  });

  it('« + bloc » ajoute un bloc d’une discipline (seed sans échauffement/RAC)', () => {
    const h = setup([customBlock()]);
    // Un seul bloc au départ.
    expect(screen.getByTestId('composite-bloc-0')).toBeOnTheScreen();
    expect(screen.queryByTestId('composite-bloc-1')).toBeNull();

    fireEvent.press(screen.getByTestId('composite-add-bloc'));
    fireEvent.press(screen.getByTestId('composite-add-bloc-strength'));

    // Nouveau segment apparu ; aucun bloc warmup/cooldown injecté (chrome séance).
    expect(screen.getByTestId('composite-bloc-1')).toBeOnTheScreen();
    const types = h
      .nodes()
      .filter((n) => !isEditableGroup(n))
      .map((n) => (n as EditableBlock).type);
    expect(types).not.toContain(BlockType.warmup);
    expect(types).not.toContain(BlockType.cooldown);
  });

  it('« + bloc » → Personnalisé ajoute un bloc custom', () => {
    const h = setup([sprintSegment()]);
    fireEvent.press(screen.getByTestId('composite-add-bloc'));
    fireEvent.press(screen.getByTestId('composite-add-bloc-custom'));

    expect(screen.getByTestId('composite-bloc-1')).toBeOnTheScreen();
    expect(
      h.nodes().some((n) => !isEditableGroup(n) && (n as EditableBlock).type === BlockType.custom),
    ).toBe(true);
  });

  it('supprime un bloc (🗑) retire la tranche correspondante', () => {
    const h = setup([sprintSegment(), customBlock()]);
    expect(h.nodes()).toHaveLength(2);

    fireEvent.press(screen.getByTestId('composite-bloc-1-delete'));

    expect(h.nodes()).toHaveLength(1);
    expect(isEditableGroup(h.nodes()[0])).toBe(true); // il reste le segment sprint
    expect(screen.queryByTestId('composite-bloc-1')).toBeNull();
  });

  it('réordonne les blocs (▼) échange les tranches', () => {
    const h = setup([sprintSegment(), customBlock()]);
    // Avant : [sprint(group), custom(block)].
    expect(isEditableGroup(h.nodes()[0])).toBe(true);

    fireEvent.press(screen.getByTestId('composite-bloc-0-down'));

    // Après : [custom(block), sprint(group)].
    expect(isEditableGroup(h.nodes()[0])).toBe(false);
    expect(isEditableGroup(h.nodes()[1])).toBe(true);
  });

  it('éditer une carte dédiée en encart écrit dans onChange (remonte au parent)', () => {
    const h = setup([sprintSegment()]);
    // Ajoute une série dans la carte Sprint encart → la liste parente gagne un nœud.
    const before = h.nodes().length;
    fireEvent.press(screen.getByTestId('sprint-add-series'));
    expect(h.nodes().length).toBeGreaterThan(before);
  });

  it('éditer le segment Personnalisé via session-add-block remonte au parent', () => {
    const h = setup([customBlock()]);
    const before = h.nodes().length;
    fireEvent.press(screen.getByTestId('session-add-block'));
    expect(h.nodes().length).toBe(before + 1);
  });
});
