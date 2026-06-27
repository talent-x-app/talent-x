import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { BlockType } from '@talent-x/api-client';
import { ThrowsEffortCanvas } from './throws-effort-card';
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
    return <ThrowsEffortCanvas nodes={nodes} onChange={setNodes} embedded={embedded} />;
  }
  render(<Harness />);
  return { groups: () => ref.nodes.filter((n) => isEditableGroup(n)) as EditableGroup[] };
}

/**
 * Tests du canvas Lancers (ADR-39, TLX-167) — ateliers technique/complets, poids réglementaire
 * auto-dérivé, style (poids), cible, presets.
 */

function makeSerie(): EditableGroup {
  return makeSeriesGroup({
    name: 'Série de lancers',
    rounds: '1',
    items: [
      makeBlock({
        type: BlockType.throws,
        name: 'Poids',
        params: {
          discipline: 'shot',
          sex: 'M',
          implementState: 'regulation',
          style: 'spin',
          targetMode: 'percent_record',
          implementKg: '7.26',
          techniqueThrows: '6',
          fullThrows: '4',
        },
      }),
    ],
  });
}

describe('ThrowsEffortCanvas', () => {
  it('affiche le canvas et le compteur technique/complets', () => {
    setup([makeSerie()]);
    expect(screen.getByTestId('throws-effort-canvas')).toBeTruthy();
    expect(screen.getByText(/lancers technique/)).toBeTruthy();
  });

  it('édite le nombre de lancers technique et complets', () => {
    const h = setup([makeSerie()]);
    act(() => fireEvent.changeText(screen.getByTestId('series-card-0-atelier-0-tech'), '10'));
    act(() => fireEvent.changeText(screen.getByTestId('series-card-0-atelier-0-full'), '8'));
    const g = h.groups()[0];
    expect(g.items[0].params.techniqueThrows).toBe('10');
    expect(g.items[0].params.fullThrows).toBe('8');
  });

  it('dérive le poids réglementaire au changement de modèle (discipline) + catégorie', () => {
    const h = setup([makeSerie()]);
    // La discipline est portée par le Modèle : appliquer « Disque — compétition » → discus (2 kg H).
    act(() => fireEvent.press(screen.getByTestId('series-card-0-preset')));
    act(() => fireEvent.press(screen.getByTestId('series-card-0-preset-discus_comp')));
    expect(h.groups()[0].items[0].params.discipline).toBe('discus');
    expect(h.groups()[0].items[0].params.implementKg).toBe('2');
    // Le poids reste auto-dérivé au changement de catégorie (1 kg F).
    act(() => fireEvent.press(screen.getByTestId('series-card-0-sex-F')));
    expect(h.groups()[0].items[0].params.implementKg).toBe('1');
  });

  it('masque le style hors discipline poids', () => {
    const h = setup([makeSerie()]);
    expect(screen.getByTestId('series-card-0-style-spin')).toBeTruthy();
    // Modèle disque → discipline discus → le style (réservé au poids) disparaît.
    act(() => fireEvent.press(screen.getByTestId('series-card-0-preset')));
    act(() => fireEvent.press(screen.getByTestId('series-card-0-preset-discus_comp')));
    expect(h.groups()[0].items[0].params.discipline).toBe('discus');
    expect(screen.queryByTestId('series-card-0-style-spin')).toBeNull();
  });

  it('change la cible en mode absolu et écrit targetMeters', () => {
    const h = setup([makeSerie()]);
    act(() => fireEvent.press(screen.getByTestId('series-card-0-tmode-absolute')));
    act(() => fireEvent.changeText(screen.getByTestId('series-card-0-target'), '18.5'));
    expect(h.groups()[0].items[0].params.targetMeters).toBe('18.5');
  });

  it('applique un preset (disque compétition) dans la carte', () => {
    const h = setup([makeSerie()]);
    act(() => fireEvent.press(screen.getByTestId('series-card-0-preset')));
    act(() => fireEvent.press(screen.getByTestId('series-card-0-preset-discus_comp')));
    expect(h.groups()[0].items[0].params.discipline).toBe('discus');
  });

  it('ajoute un atelier puis une série', () => {
    const h = setup([makeSerie()]);
    act(() => fireEvent.press(screen.getByTestId('series-card-0-add-atelier')));
    expect(h.groups()[0].items).toHaveLength(2);
    act(() => fireEvent.press(screen.getByTestId('throws-add-series')));
    expect(h.groups()).toHaveLength(2);
  });

  it('mode encart : séries + ajout rendus, en-tête KPI et barres écha/RAC masqués', () => {
    setup([makeSerie()], true);
    expect(screen.getByTestId('series-card-0')).toBeTruthy();
    expect(screen.getByTestId('throws-add-series')).toBeTruthy();
    expect(screen.queryByTestId('throws-canvas-summary')).toBeNull();
    expect(screen.queryByTestId('warmup-bar')).toBeNull();
    expect(screen.queryByTestId('cooldown-bar')).toBeNull();
  });
});
