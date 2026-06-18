import { ThemeProvider } from '@talent-x/design-tokens';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { Pressable, Text } from 'react-native';

jest.mock('@talent-x/api-client', () => ({
  LoadUnit: { kg: 'kg', lb: 'lb', percent_1rm: 'percent_1rm', bodyweight: 'bodyweight' },
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
}));

import { GenericBlocksEditor } from './generic-blocks-editor';
import { makeEmptyBlock, nodesToItems, type EditableNode } from './session-builder-ui';

/**
 * Tests du **rendu/sérialisation de l'éditeur générique** (C-05, ex-tests `SessionBuilderScreen`)
 * déplacés ici après l'extraction `GenericBlocksEditor` (TLX-177a) et le passage au canvas
 * composite (ADR-42, TLX-178) : dès qu'un bloc reçoit un type de discipline reconnue il quitte
 * l'éditeur générique pour sa carte dédiée dans le composite, donc on teste désormais l'éditeur
 * générique **isolé**. Les assertions de sérialisation (`nodesToItems`) sont **identiques** à
 * celles que faisait l'écran (même fonction de sérialisation, même payload `items`).
 */

function Harness({ initial }: { initial?: EditableNode[] }) {
  const [nodes, setNodes] = useState<EditableNode[]>(() => initial ?? [makeEmptyBlock()]);
  return (
    <ThemeProvider>
      <GenericBlocksEditor nodes={nodes} onChange={setNodes} />
      <Pressable testID="capture" onPress={() => capture(nodesToItems(nodes))}>
        <Text>capture</Text>
      </Pressable>
    </ThemeProvider>
  );
}

let captured: unknown[] = [];
function capture(items: unknown[]) {
  captured = items;
}

function items() {
  fireEvent.press(screen.getByTestId('capture'));
  return captured as Record<string, unknown>[];
}

beforeEach(() => {
  captured = [];
});

describe('GenericBlocksEditor — rendu de base (C-05)', () => {
  it('bloc custom par défaut : pas de section params', () => {
    render(<Harness />);
    expect(screen.queryByTestId('block-0-params')).toBeNull();
  });

  it('le sélecteur de type n’expose pas échauffement / retour au calme (phases — TLX-172 N6)', () => {
    render(<Harness />);
    // Types d'exercice réels présents…
    expect(screen.getByTestId('block-0-type-sprint')).toBeOnTheScreen();
    expect(screen.getByTestId('block-0-type-core')).toBeOnTheScreen();
    // …mais pas les phases (gérées comme chrome de séance, pas comme exercices).
    expect(screen.queryByTestId('block-0-type-warmup')).toBeNull();
    expect(screen.queryByTestId('block-0-type-cooldown')).toBeNull();
  });

  it('ajoute et supprime des blocs', () => {
    render(<Harness />);
    fireEvent.press(screen.getByTestId('session-add-block'));
    expect(screen.getByTestId('block-1')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('block-1-remove'));
    expect(screen.queryByTestId('block-1')).toBeNull();
  });

  it('masque le champ de base redondant sur un bloc typé (TLX-94)', () => {
    render(<Harness />);
    expect(screen.getByTestId('block-0-reps')).toBeOnTheScreen();
    expect(screen.getByTestId('block-0-sets')).toBeOnTheScreen();

    fireEvent.press(screen.getByTestId('block-0-type-sprint'));
    expect(screen.queryByTestId('block-0-reps')).toBeNull();
    expect(screen.getByTestId('block-0-sets')).toBeOnTheScreen();
    expect(screen.getByTestId('block-0-param-reps')).toBeOnTheScreen();
  });

  it('ne sérialise pas un champ de base masqué — pas de fuite (TLX-94)', () => {
    render(<Harness />);
    fireEvent.changeText(screen.getByTestId('block-0-name'), '8 × 60m');
    fireEvent.changeText(screen.getByTestId('block-0-reps'), '99');
    fireEvent.press(screen.getByTestId('block-0-type-sprint'));
    fireEvent.changeText(screen.getByTestId('block-0-param-reps'), '8');
    fireEvent.changeText(screen.getByTestId('block-0-param-distanceMeters'), '60');

    const item = items()[0];
    expect(item).not.toHaveProperty('reps');
    expect(item.params).toMatchObject({ reps: 8, distanceMeters: 60 });
  });
});

describe('GenericBlocksEditor — sérialisation par type (TLX-053→061, ADR-38)', () => {
  it('sérialise le document exercises v1 (nombres, charge)', () => {
    render(<Harness />);
    fireEvent.changeText(screen.getByTestId('block-0-name'), 'Squat arrière');
    fireEvent.changeText(screen.getByTestId('block-0-sets'), '5');
    fireEvent.changeText(screen.getByTestId('block-0-reps'), '3');
    fireEvent.changeText(screen.getByTestId('block-0-load'), '80');
    fireEvent.press(screen.getByTestId('block-0-unit-kg'));

    expect(items()[0]).toMatchObject({
      name: 'Squat arrière',
      order: 1,
      sets: 5,
      reps: 3,
      load: { value: 80, unit: 'kg' },
    });
  });

  it('Intervalles → type + params (TLX-053/054)', () => {
    render(<Harness />);
    fireEvent.changeText(screen.getByTestId('block-0-name'), '6 × 400m');
    fireEvent.press(screen.getByTestId('block-0-type-interval'));
    expect(screen.getByTestId('block-0-params')).toBeOnTheScreen();
    fireEvent.changeText(screen.getByTestId('block-0-param-reps'), '6');
    fireEvent.changeText(screen.getByTestId('block-0-param-distanceMeters'), '400');
    fireEvent.changeText(screen.getByTestId('block-0-param-workSeconds'), '90');
    fireEvent.changeText(screen.getByTestId('block-0-param-recoverySeconds'), '120');

    expect(items()[0]).toMatchObject({
      name: '6 × 400m',
      order: 1,
      type: 'interval',
      params: { reps: 6, distanceMeters: 400, workSeconds: 90, recoverySeconds: 120 },
    });
  });

  it('Hauteur/Perche → sélecteur discipline + params (TLX-075/ADR-25)', () => {
    render(<Harness />);
    fireEvent.changeText(screen.getByTestId('block-0-name'), 'Hauteur');
    fireEvent.press(screen.getByTestId('block-0-type-vertical_jumps'));
    expect(screen.getByTestId('block-0-params')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('block-0-param-discipline-pole'));
    fireEvent.changeText(screen.getByTestId('block-0-param-startHeightCm'), '420');
    fireEvent.changeText(screen.getByTestId('block-0-param-incrementCm'), '15');

    expect(items()[0]).toMatchObject({
      name: 'Hauteur',
      order: 1,
      type: 'vertical_jumps',
      params: { discipline: 'pole', startHeightCm: 420, incrementCm: 15 },
    });
  });

  it('Sprints → type + params (distance, reps, récup) (TLX-055)', () => {
    render(<Harness />);
    fireEvent.changeText(screen.getByTestId('block-0-name'), '8 × 60m départ');
    fireEvent.press(screen.getByTestId('block-0-type-sprint'));
    expect(screen.getByTestId('block-0-params')).toBeOnTheScreen();
    fireEvent.changeText(screen.getByTestId('block-0-param-reps'), '8');
    fireEvent.changeText(screen.getByTestId('block-0-param-distanceMeters'), '60');
    fireEvent.changeText(screen.getByTestId('block-0-param-recoverySeconds'), '180');

    expect(items()[0]).toMatchObject({
      name: '8 × 60m départ',
      order: 1,
      type: 'sprint',
      params: { reps: 8, distanceMeters: 60, recoverySeconds: 180 },
    });
  });

  it('Course → type + params (distance, allure, dénivelé) (TLX-056)', () => {
    render(<Harness />);
    fireEvent.changeText(screen.getByTestId('block-0-name'), 'Tempo 5 km');
    fireEvent.press(screen.getByTestId('block-0-type-endurance'));
    expect(screen.getByTestId('block-0-params')).toBeOnTheScreen();
    fireEvent.changeText(screen.getByTestId('block-0-param-distanceMeters'), '5000');
    fireEvent.changeText(screen.getByTestId('block-0-param-paceSecondsPerKm'), '300');
    fireEvent.changeText(screen.getByTestId('block-0-param-elevationMeters'), '120');

    expect(items()[0]).toMatchObject({
      name: 'Tempo 5 km',
      order: 1,
      type: 'endurance',
      params: { distanceMeters: 5000, paceSecondsPerKm: 300, elevationMeters: 120 },
    });
  });

  it('Haies → type + params (hauteur décimale, espacement, rythme) (TLX-057)', () => {
    render(<Harness />);
    fireEvent.changeText(screen.getByTestId('block-0-name'), '5 haies rythme 3');
    fireEvent.press(screen.getByTestId('block-0-type-hurdles'));
    expect(screen.getByTestId('block-0-params')).toBeOnTheScreen();
    fireEvent.changeText(screen.getByTestId('block-0-param-distanceMeters'), '110');
    fireEvent.changeText(screen.getByTestId('block-0-param-heightCm'), '84');
    fireEvent.changeText(screen.getByTestId('block-0-param-spacingMeters'), '8.5');
    fireEvent.changeText(screen.getByTestId('block-0-param-rhythmSteps'), '3');

    expect(items()[0]).toMatchObject({
      name: '5 haies rythme 3',
      order: 1,
      type: 'hurdles',
      params: { distanceMeters: 110, heightCm: 84, spacingMeters: 8.5, rhythmSteps: 3 },
    });
  });

  it('Sauts → type + params (discipline, élan+unité, cible, ADR-38) (TLX-058)', () => {
    render(<Harness />);
    fireEvent.changeText(screen.getByTestId('block-0-name'), 'Longueur — élan complet');
    fireEvent.press(screen.getByTestId('block-0-type-jumps'));
    expect(screen.getByTestId('block-0-params')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('block-0-param-discipline-long'));
    fireEvent.changeText(screen.getByTestId('block-0-param-approach'), '18');
    fireEvent.press(screen.getByTestId('block-0-param-approachUnit-steps'));
    fireEvent.changeText(screen.getByTestId('block-0-param-targetMeters'), '7.2');
    fireEvent.changeText(screen.getByTestId('block-0-param-fullJumps'), '6');

    expect(items()[0]).toMatchObject({
      name: 'Longueur — élan complet',
      order: 1,
      type: 'jumps',
      params: {
        discipline: 'long',
        approach: 18,
        approachUnit: 'steps',
        targetMeters: 7.2,
        fullJumps: 6,
      },
    });
  });

  it('Sprints → params additifs (type de départ, zone lancée bool, ADR-38)', () => {
    render(<Harness />);
    fireEvent.changeText(screen.getByTestId('block-0-name'), '30 m lancé');
    fireEvent.press(screen.getByTestId('block-0-type-sprint'));
    expect(screen.getByTestId('block-0-params')).toBeOnTheScreen();
    fireEvent.changeText(screen.getByTestId('block-0-param-distanceMeters'), '30');
    fireEvent.press(screen.getByTestId('block-0-param-startType-flying'));
    fireEvent.press(screen.getByTestId('block-0-param-flyingZone-true'));
    fireEvent.press(screen.getByTestId('block-0-param-intensityMode-percent_record'));
    fireEvent.changeText(screen.getByTestId('block-0-param-intensityValue'), '95');

    const item = items()[0];
    expect(item.type).toBe('sprint');
    expect(item.params).toMatchObject({
      distanceMeters: 30,
      startType: 'flying',
      flyingZone: true,
      intensityMode: 'percent_record',
      intensityValue: 95,
    });
  });

  it('Lancers → type + params (engin kg, technique/complets) (TLX-059)', () => {
    render(<Harness />);
    fireEvent.changeText(screen.getByTestId('block-0-name'), 'Poids 7.26 kg');
    fireEvent.press(screen.getByTestId('block-0-type-throws'));
    expect(screen.getByTestId('block-0-params')).toBeOnTheScreen();
    fireEvent.changeText(screen.getByTestId('block-0-param-implementKg'), '7.26');
    fireEvent.changeText(screen.getByTestId('block-0-param-techniqueThrows'), '10');
    fireEvent.changeText(screen.getByTestId('block-0-param-fullThrows'), '6');

    expect(items()[0]).toMatchObject({
      name: 'Poids 7.26 kg',
      order: 1,
      type: 'throws',
      params: { implementKg: 7.26, techniqueThrows: 10, fullThrows: 6 },
    });
  });

  it('Musculation → base v1 + tempo optionnel ; vide → aucun params (TLX-060/ADR-28)', () => {
    render(<Harness />);
    fireEvent.changeText(screen.getByTestId('block-0-name'), 'Développé couché');
    fireEvent.press(screen.getByTestId('block-0-type-strength'));
    fireEvent.changeText(screen.getByTestId('block-0-sets'), '4');
    fireEvent.changeText(screen.getByTestId('block-0-reps'), '6');
    fireEvent.changeText(screen.getByTestId('block-0-load'), '90');
    fireEvent.press(screen.getByTestId('block-0-unit-kg'));
    expect(screen.getByTestId('block-0-param-tempo')).toBeOnTheScreen();

    const item = items()[0];
    expect(item).toMatchObject({
      name: 'Développé couché',
      order: 1,
      type: 'strength',
      sets: 4,
      reps: 6,
      load: { value: 90, unit: 'kg' },
    });
    expect(item).not.toHaveProperty('params');
  });

  it('% VMA (intervalles) et tempo (musculation) sérialisés (ADR-28 règle 6)', () => {
    render(<Harness />);
    fireEvent.changeText(screen.getByTestId('block-0-name'), '6 × 400m');
    fireEvent.press(screen.getByTestId('block-0-type-interval'));
    fireEvent.changeText(screen.getByTestId('block-0-param-distanceMeters'), '400');
    fireEvent.changeText(screen.getByTestId('block-0-param-percentVma'), '105');
    fireEvent.press(screen.getByTestId('session-add-block'));
    fireEvent.changeText(screen.getByTestId('block-1-name'), 'Squat arrière');
    fireEvent.press(screen.getByTestId('block-1-type-strength'));
    fireEvent.changeText(screen.getByTestId('block-1-param-tempo'), ' 3-1-1-0 ');

    const out = items();
    expect(out[0]).toMatchObject({
      type: 'interval',
      params: { distanceMeters: 400, percentVma: 105 },
    });
    expect(out[1]).toMatchObject({ type: 'strength', params: { tempo: '3-1-1-0' } });
  });

  it('Gainage / Circuit → type + params partagés (tours, station) (TLX-061)', () => {
    render(<Harness />);
    fireEvent.changeText(screen.getByTestId('block-0-name'), 'Circuit gainage');
    fireEvent.press(screen.getByTestId('block-0-type-core'));
    expect(screen.getByTestId('block-0-params')).toBeOnTheScreen();
    fireEvent.changeText(screen.getByTestId('block-0-param-rounds'), '3');
    fireEvent.changeText(screen.getByTestId('block-0-param-stationSeconds'), '45');

    expect(items()[0]).toMatchObject({
      name: 'Circuit gainage',
      order: 1,
      type: 'core',
      params: { rounds: 3, stationSeconds: 45 },
    });
  });
});

describe('GenericBlocksEditor — groupes (ADR-27)', () => {
  it('crée une séance à GROUPE : order global, rounds/R, membre sans sets (v3)', () => {
    render(<Harness />);
    fireEvent.changeText(screen.getByTestId('block-0-name'), 'Échauffement');
    fireEvent.press(screen.getByTestId('session-add-group'));
    fireEvent.changeText(screen.getByTestId('group-1-name'), 'Force-vitesse');
    fireEvent.press(screen.getByTestId('group-1-type-superset'));
    fireEvent.changeText(screen.getByTestId('group-1-rounds'), '3');
    fireEvent.changeText(screen.getByTestId('group-1-rest-rounds'), '180');
    fireEvent.changeText(screen.getByTestId('group-1-block-0-name'), 'Squat lourd');
    fireEvent.press(screen.getByTestId('group-1-block-0-type-strength'));
    expect(screen.queryByTestId('group-1-block-0-sets')).toBeNull();
    expect(screen.getByTestId('block-0-sets')).toBeOnTheScreen();
    fireEvent.changeText(screen.getByTestId('group-1-block-0-reps'), '3');

    const out = items();
    expect(out[0]).toMatchObject({ name: 'Échauffement', order: 1 });
    expect(out[1]).toMatchObject({
      kind: 'group',
      name: 'Force-vitesse',
      order: 2,
      groupType: 'superset',
      rounds: 3,
      restBetweenRoundsSeconds: 180,
    });
    const group = out[1] as { items: Record<string, unknown>[] };
    expect(group.items[0]).toMatchObject({
      name: 'Squat lourd',
      order: 3,
      type: 'strength',
      reps: 3,
    });
    expect(group.items[0]).not.toHaveProperty('sets');
  });

  it('déplace un bloc dans le groupe voisin puis l’en sort (dans/hors)', () => {
    render(<Harness />);
    fireEvent.changeText(screen.getByTestId('block-0-name'), 'Échauffement');
    fireEvent.press(screen.getByTestId('session-add-group'));
    fireEvent.press(screen.getByTestId('block-0-group'));

    expect(screen.queryByTestId('block-0')).toBeNull();
    expect(screen.getByTestId('group-0')).toBeOnTheScreen();
    expect(screen.getByTestId('group-0-block-0-name').props.value).toBe('Échauffement');

    fireEvent.press(screen.getByTestId('group-0-block-0-ungroup'));
    expect(screen.getByTestId('block-1')).toBeOnTheScreen();
    expect(screen.getByTestId('block-1-name').props.value).toBe('Échauffement');
  });
});
