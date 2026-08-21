import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { BlockType } from '@talent-x/api-client';
import { SprintEffortCanvas, makeCooldownBlock, makeWarmupBlock } from './sprint-effort-card';
import {
  isEditableGroup,
  makeBlock,
  makeSeriesGroup,
  type EditableBlock,
  type EditableNode,
} from './session-builder-ui';

/**
 * Tests du canvas Sprint — structure maquette (ADR-39, TLX-165).
 * Vérifie : rendu des barres Échauffement/RAC, cartes de série, tableau de sprints,
 * mutations (ajout/suppression de sprint et série, preset, params partagés).
 */

/** Groupe sprint minimal valide. */
function makeSerie(
  opts: {
    rounds?: number;
    restR?: number;
    sprints?: { distance: number; intensity: number; recovery: number }[];
  } = {},
): EditableNode {
  const sprints = opts.sprints ?? [{ distance: 60, intensity: 95, recovery: 240 }];
  return makeSeriesGroup({
    name: 'Série de sprint',
    rounds: String(opts.rounds ?? 1),
    restBetweenRoundsSeconds: String(opts.restR ?? 300),
    items: sprints.map((s) =>
      makeBlock({
        type: BlockType.sprint,
        name: `${s.distance} m`,
        params: {
          reps: '1',
          distanceMeters: String(s.distance),
          recoverySeconds: String(s.recovery),
          intensityMode: 'percent_record',
          intensityValue: String(s.intensity),
          startType: 'blocks',
          flyingZone: 'false',
        },
      }),
    ),
  });
}

/** Canvas avec échauffement + 1 série + retour au calme. */
function defaultNodes(): EditableNode[] {
  return [makeWarmupBlock(), makeSerie(), makeCooldownBlock()];
}

describe('SprintEffortCanvas', () => {
  it('affiche les barres Échauffement et Retour au calme', () => {
    render(<SprintEffortCanvas nodes={defaultNodes()} onChange={jest.fn()} />);
    expect(screen.getByTestId('warmup-bar')).toBeTruthy();
    expect(screen.getByTestId('cooldown-bar')).toBeTruthy();
    expect(screen.getByText('Échauffement')).toBeTruthy();
    expect(screen.getByText('Retour au calme')).toBeTruthy();
  });

  it('crée des barres par défaut quand elles sont absentes des nodes', () => {
    render(<SprintEffortCanvas nodes={[makeSerie()]} onChange={jest.fn()} />);
    expect(screen.getByTestId('warmup-bar')).toBeTruthy();
    expect(screen.getByTestId('cooldown-bar')).toBeTruthy();
  });

  it("affiche l'en-tête KPI haute intensité", () => {
    render(<SprintEffortCanvas nodes={defaultNodes()} onChange={jest.fn()} />);
    expect(screen.getByTestId('sprint-canvas-summary')).toBeTruthy();
    expect(screen.getByText(/Volume haute intensité/)).toBeTruthy();
  });

  it('affiche une carte par série', () => {
    const nodes = [makeWarmupBlock(), makeSerie(), makeSerie(), makeCooldownBlock()];
    render(<SprintEffortCanvas nodes={nodes} onChange={jest.fn()} />);
    expect(screen.getByTestId('series-card-0')).toBeTruthy();
    expect(screen.getByTestId('series-card-1')).toBeTruthy();
  });

  it('affiche le résumé condensé dans la tuile réduite', () => {
    render(<SprintEffortCanvas nodes={defaultNodes()} onChange={jest.fn()} />);
    expect(screen.getByTestId('series-card-0-summary')).toBeTruthy();
  });

  it('résumé : intensités non saisies → « — » au lieu de « 0 % » (TLX-172 #7)', () => {
    const serie = makeSeriesGroup({
      name: 'Série de sprint',
      rounds: '2',
      restBetweenRoundsSeconds: '300',
      items: [
        makeBlock({
          type: BlockType.sprint,
          name: '60 m',
          // Pas d'`intensityValue` saisie.
          params: {
            reps: '1',
            distanceMeters: '60',
            intensityMode: 'percent_record',
            startType: 'blocks',
            flyingZone: 'false',
          },
        }),
      ],
    });
    render(<SprintEffortCanvas nodes={[serie]} onChange={jest.fn()} />);
    const summary = screen.getByTestId('series-card-0-summary');
    // Cœur du correctif : aucune intensité fantôme « 0 % » dans le résumé.
    expect(summary).not.toHaveTextContent('0%');
    expect(summary).not.toHaveTextContent('0 %');
  });

  it('ajoute une série via le bouton', () => {
    const onChange = jest.fn();
    render(<SprintEffortCanvas nodes={defaultNodes()} onChange={onChange} />);
    act(() => {
      fireEvent.press(screen.getByTestId('sprint-add-series'));
    });
    const [arg] = onChange.mock.calls[onChange.mock.calls.length - 1];
    // warmup + 2 séries + cooldown = 4 nodes
    const groups = arg.filter((n: EditableNode) => isEditableGroup(n));
    expect(groups.length).toBe(2);
  });

  it('supprime une série si total > 1', () => {
    const onChange = jest.fn();
    const nodes = [makeWarmupBlock(), makeSerie(), makeSerie(), makeCooldownBlock()];
    render(<SprintEffortCanvas nodes={nodes} onChange={onChange} />);
    act(() => {
      fireEvent.press(screen.getByTestId('series-card-0-del'));
    });
    const [arg] = onChange.mock.calls[onChange.mock.calls.length - 1];
    const groups = arg.filter((n: EditableNode) => isEditableGroup(n));
    expect(groups.length).toBe(1);
  });

  it("n'affiche pas le bouton suppression quand une seule série", () => {
    render(<SprintEffortCanvas nodes={defaultNodes()} onChange={jest.fn()} />);
    expect(screen.queryByTestId('series-card-0-del')).toBeNull();
  });

  it('déplace une série vers le haut', () => {
    const onChange = jest.fn();
    const s1 = makeSerie({ rounds: 1 });
    const s2 = makeSerie({ rounds: 3 });
    const nodes = [makeWarmupBlock(), s1, s2, makeCooldownBlock()];
    render(<SprintEffortCanvas nodes={nodes} onChange={onChange} />);
    act(() => {
      fireEvent.press(screen.getByTestId('series-card-1-up'));
    });
    const [arg] = onChange.mock.calls[onChange.mock.calls.length - 1];
    const groups = arg.filter((n: EditableNode) => isEditableGroup(n));
    expect(groups[0]).toBe(s2);
    expect(groups[1]).toBe(s1);
  });

  it('ajoute un sprint à une série', () => {
    const onChange = jest.fn();
    render(<SprintEffortCanvas nodes={defaultNodes()} onChange={onChange} />);
    act(() => {
      fireEvent.press(screen.getByTestId('series-card-0-add-sprint'));
    });
    const [arg] = onChange.mock.calls[onChange.mock.calls.length - 1];
    const groups = arg.filter((n: EditableNode) => isEditableGroup(n));
    expect(groups[0].items.length).toBe(2);
  });

  it('supprime un sprint si plusieurs sprints dans la série', () => {
    const onChange = jest.fn();
    const nodes = [
      makeWarmupBlock(),
      makeSerie({
        sprints: [
          { distance: 30, intensity: 90, recovery: 180 },
          { distance: 60, intensity: 95, recovery: 240 },
        ],
      }),
      makeCooldownBlock(),
    ];
    render(<SprintEffortCanvas nodes={nodes} onChange={onChange} />);
    act(() => {
      fireEvent.press(screen.getByTestId('series-card-0-sprint-0-del'));
    });
    const [arg] = onChange.mock.calls[onChange.mock.calls.length - 1];
    expect(arg[1].items.length).toBe(1);
    expect(arg[1].items[0].params.distanceMeters).toBe('60');
  });

  it("affiche → R pour le dernier sprint (pas d'input récup)", () => {
    render(<SprintEffortCanvas nodes={defaultNodes()} onChange={jest.fn()} />);
    expect(screen.getByText('→ R')).toBeTruthy();
    // Le seul sprint est le dernier : pas d'input récup
    expect(screen.queryByTestId('series-card-0-sprint-0-rec')).toBeNull();
  });

  it("affiche l'input récup r pour les sprints non-derniers", () => {
    const nodes = [
      makeWarmupBlock(),
      makeSerie({
        sprints: [
          { distance: 30, intensity: 90, recovery: 180 },
          { distance: 60, intensity: 95, recovery: 240 },
        ],
      }),
      makeCooldownBlock(),
    ];
    render(<SprintEffortCanvas nodes={nodes} onChange={jest.fn()} />);
    expect(screen.getByTestId('series-card-0-sprint-0-rec')).toBeTruthy();
    expect(screen.queryByTestId('series-card-0-sprint-1-rec')).toBeNull();
  });

  it("met à jour la distance d'un sprint", () => {
    const onChange = jest.fn();
    render(<SprintEffortCanvas nodes={defaultNodes()} onChange={onChange} />);
    act(() => {
      fireEvent.changeText(screen.getByTestId('series-card-0-sprint-0-dist'), '100');
    });
    const [arg] = onChange.mock.calls[onChange.mock.calls.length - 1];
    expect(arg[1].items[0].params.distanceMeters).toBe('100');
    expect(arg[1].items[0].name).toBe('100 m');
  });

  it("met à jour l'intensité d'un sprint", () => {
    const onChange = jest.fn();
    render(<SprintEffortCanvas nodes={defaultNodes()} onChange={onChange} />);
    act(() => {
      fireEvent.changeText(screen.getByTestId('series-card-0-sprint-0-int'), '98');
    });
    const [arg] = onChange.mock.calls[onChange.mock.calls.length - 1];
    expect(arg[1].items[0].params.intensityValue).toBe('98');
  });

  it('change le nombre de séries (rounds)', () => {
    const onChange = jest.fn();
    render(<SprintEffortCanvas nodes={defaultNodes()} onChange={onChange} />);
    act(() => {
      fireEvent.press(screen.getByTestId('series-card-0-rounds-inc'));
    });
    const [arg] = onChange.mock.calls[onChange.mock.calls.length - 1];
    expect(arg[1].rounds).toBe('2');
  });

  it('met à jour la récup R entre séries', () => {
    const onChange = jest.fn();
    render(<SprintEffortCanvas nodes={defaultNodes()} onChange={onChange} />);
    act(() => {
      fireEvent.changeText(screen.getByTestId('series-card-0-restR'), '5');
    });
    const [arg] = onChange.mock.calls[onChange.mock.calls.length - 1];
    expect(arg[1].restBetweenRoundsSeconds).toBe('300'); // 5 * 60 = 300
  });

  it("préserve échauffement et RAC lors d'une mutation de série", () => {
    const onChange = jest.fn();
    render(<SprintEffortCanvas nodes={defaultNodes()} onChange={onChange} />);
    act(() => {
      fireEvent.press(screen.getByTestId('series-card-0-rounds-inc'));
    });
    const [arg] = onChange.mock.calls[onChange.mock.calls.length - 1];
    expect((arg[0] as EditableBlock).type).toBe(BlockType.warmup);
    expect((arg[arg.length - 1] as EditableBlock).type).toBe(BlockType.cooldown);
  });

  it('applique un preset à une série', () => {
    const onChange = jest.fn();
    render(<SprintEffortCanvas nodes={defaultNodes()} onChange={onChange} />);
    // Ouvre le picker de preset
    act(() => {
      fireEvent.press(screen.getByTestId('series-card-0-preset'));
    });
    // Choisit "Vitesse max"
    act(() => {
      fireEvent.press(screen.getByText('Vitesse max'));
    });
    const [arg] = onChange.mock.calls[onChange.mock.calls.length - 1];
    expect(arg[1].rounds).toBe('2');
    expect(arg[1].items.length).toBe(2);
    expect(arg[1].items[0].params.distanceMeters).toBe('60');
  });

  it("change le mode d'intensité pour toute la série", () => {
    const onChange = jest.fn();
    render(<SprintEffortCanvas nodes={defaultNodes()} onChange={onChange} />);
    act(() => {
      fireEvent.press(screen.getByTestId('series-card-0-imode-target_time'));
    });
    const [arg] = onChange.mock.calls[onChange.mock.calls.length - 1];
    expect(arg[1].items[0].params.intensityMode).toBe('target_time');
  });

  it('change le type de départ pour toute la série', () => {
    const onChange = jest.fn();
    render(<SprintEffortCanvas nodes={defaultNodes()} onChange={onChange} />);
    act(() => {
      fireEvent.press(screen.getByTestId('series-card-0-start-standing'));
    });
    const [arg] = onChange.mock.calls[onChange.mock.calls.length - 1];
    expect(arg[1].items[0].params.startType).toBe('standing');
  });

  it("bascule la zone d'élan", () => {
    const onChange = jest.fn();
    render(<SprintEffortCanvas nodes={defaultNodes()} onChange={onChange} />);
    act(() => {
      fireEvent.press(screen.getByTestId('series-card-0-flying'));
    });
    const [arg] = onChange.mock.calls[onChange.mock.calls.length - 1];
    expect(arg[1].items[0].params.flyingZone).toBe('true');
  });

  // --- Type de récup r (ADR-39 §5/§6, TLX-224) ---------------------------------------------

  it('récup r : chips rendues, « Passive » sélectionnée par défaut (param absent)', () => {
    // `makeSerie` ne pose pas `recoveryType` → cas d'une série héritée d'avant la bascule.
    render(<SprintEffortCanvas nodes={defaultNodes()} onChange={jest.fn()} />);
    expect(
      screen.getByTestId('series-card-0-rectype-passive').props.accessibilityState.selected,
    ).toBe(true);
    expect(
      screen.getByTestId('series-card-0-rectype-active').props.accessibilityState.selected,
    ).toBe(false);
  });

  it('récup r : bascule sur Active → posée sur TOUS les sprints de la série', () => {
    const onChange = jest.fn();
    const nodes = [
      makeWarmupBlock(),
      makeSerie({
        sprints: [
          { distance: 30, intensity: 90, recovery: 180 },
          { distance: 60, intensity: 95, recovery: 240 },
        ],
      }),
      makeCooldownBlock(),
    ];
    render(<SprintEffortCanvas nodes={nodes} onChange={onChange} />);
    act(() => {
      fireEvent.press(screen.getByTestId('series-card-0-rectype-active'));
    });
    const [arg] = onChange.mock.calls[onChange.mock.calls.length - 1];
    // Propriété partagée de la série : portée par chaque feuille pour le round-trip C-05.
    expect(arg[1].items.map((b: EditableBlock) => b.params.recoveryType)).toEqual([
      'active',
      'active',
    ]);
  });

  it('récup r : un sprint ajouté hérite du type de récup de la série', () => {
    const onChange = jest.fn();
    const serie = makeSerie();
    (serie as { items: EditableBlock[] }).items[0].params.recoveryType = 'active';
    render(
      <SprintEffortCanvas
        nodes={[makeWarmupBlock(), serie, makeCooldownBlock()]}
        onChange={onChange}
      />,
    );
    act(() => {
      fireEvent.press(screen.getByTestId('series-card-0-add-sprint'));
    });
    const [arg] = onChange.mock.calls[onChange.mock.calls.length - 1];
    expect(arg[1].items[1].params.recoveryType).toBe('active');
  });

  it('récup r : un preset pose recoveryType (le document dit ce que la carte affiche)', () => {
    const onChange = jest.fn();
    render(<SprintEffortCanvas nodes={defaultNodes()} onChange={onChange} />);
    act(() => {
      fireEvent.press(screen.getByTestId('series-card-0-preset'));
    });
    act(() => {
      fireEvent.press(screen.getByText('Vitesse max'));
    });
    const [arg] = onChange.mock.calls[onChange.mock.calls.length - 1];
    // Sans ça, la carte afficherait « Passive » (défaut de lecture) sur un document muet.
    for (const block of arg[1].items as EditableBlock[]) {
      expect(block.params.recoveryType).toBe('passive');
    }
  });

  it("édite la description de l'échauffement", () => {
    const onChange = jest.fn();
    render(<SprintEffortCanvas nodes={defaultNodes()} onChange={onChange} />);
    // Expand warmup bar
    act(() => {
      fireEvent.press(screen.getByTestId('warmup-bar-toggle'));
    });
    act(() => {
      fireEvent.changeText(
        screen.getByPlaceholderText('Description du bloc…'),
        'Test échauffement',
      );
    });
    const [arg] = onChange.mock.calls[onChange.mock.calls.length - 1];
    expect((arg[0] as EditableBlock).notes).toBe('Test échauffement');
  });

  /**
   * TLX-259 défaut 2 — la durée d'une borne doit être **saisissable**. Elle ne l'était pas :
   * `stationSeconds` supplantait `durationSeconds`, donc aucun champ, donc la seule façon de
   * dire « 25 min » était de l'écrire dans `notes` — invisible pour le calcul de charge.
   */
  it("édite la durée de l'échauffement (TLX-259)", () => {
    const onChange = jest.fn();
    render(<SprintEffortCanvas nodes={defaultNodes()} onChange={onChange} />);
    act(() => {
      fireEvent.press(screen.getByTestId('warmup-bar-toggle'));
    });
    // Le champ est à la minute (comme « Durée (min) » du brief) ; le document, en secondes.
    expect(screen.getByTestId('warmup-bar-duration').props.value).toBe('25');
    act(() => {
      fireEvent.changeText(screen.getByTestId('warmup-bar-duration'), '30');
    });

    const [arg] = onChange.mock.calls[onChange.mock.calls.length - 1];
    expect((arg[0] as EditableBlock).durationSeconds).toBe('1800');
  });

  it('largeur mobile : cellules rétrécissables (minWidth 0) + colonne récup fixe (TLX-191)', () => {
    const nodes = [
      makeWarmupBlock(),
      makeSerie({
        sprints: [
          { distance: 30, intensity: 90, recovery: 180 },
          { distance: 60, intensity: 95, recovery: 240 },
        ],
      }),
      makeCooldownBlock(),
    ];
    render(<SprintEffortCanvas nodes={nodes} onChange={jest.fn()} />);
    // Cœur du correctif : react-native-web donne aux items flex un `min-width: auto` (≈ largeur
    // intrinsèque de l'<input>, ~150px) → sans `minWidth: 0`, les colonnes se chevauchent en
    // largeur téléphone. Les inputs ET leurs en-têtes doivent pouvoir rétrécir.
    expect(screen.getByTestId('series-card-0-sprint-0-dist')).toHaveStyle({ minWidth: 0, flex: 1 });
    expect(screen.getByTestId('series-card-0-sprint-0-int')).toHaveStyle({ minWidth: 0, flex: 1 });
    expect(screen.getByText('Distance')).toHaveStyle({ flex: 1, minWidth: 0 });
    expect(screen.getByText('Intensité')).toHaveStyle({ flex: 1, minWidth: 0 });
    // Colonne récup à largeur fixe (72) → la dernière ligne « → R » reste alignée.
    expect(screen.getByText('Récup r')).toHaveStyle({ width: 72 });
  });

  it('mode encart : séries + ajout rendus, en-tête KPI et barres écha/RAC masqués', () => {
    render(<SprintEffortCanvas nodes={defaultNodes()} onChange={jest.fn()} embedded />);
    expect(screen.getByTestId('series-card-0')).toBeTruthy();
    expect(screen.getByTestId('sprint-add-series')).toBeTruthy();
    expect(screen.queryByTestId('sprint-canvas-summary')).toBeNull();
    expect(screen.queryByTestId('warmup-bar')).toBeNull();
    expect(screen.queryByTestId('cooldown-bar')).toBeNull();
  });
});
