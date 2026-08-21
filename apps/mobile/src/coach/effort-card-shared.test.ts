import { BlockType } from '@talent-x/api-client';
import { barDurationMinutes, barDurationSeconds, splitEffortNodes } from './effort-card-shared';
import {
  isEditableGroup,
  makeBlock,
  makeCooldownBlock,
  makeSeriesGroup,
  makeWarmupBlock,
  nodesToItems,
  sanitizeNumeric,
  type EditableGroup,
  type EditableNode,
} from './session-builder-ui';

/** Découpe avec les types/fabriques par défaut (échauffement/RAC standard). */
function split(nodes: EditableNode[]) {
  return splitEffortNodes(
    nodes,
    BlockType.warmup,
    BlockType.cooldown,
    makeWarmupBlock,
    makeCooldownBlock,
  );
}

describe('splitEffortNodes — pas de perte de bloc top-level (TLX-168)', () => {
  it('enveloppe un bloc discipline top-level dans une série mono-item au lieu de le jeter', () => {
    const sprint = makeBlock({
      type: BlockType.sprint,
      name: '60 m',
      params: { distanceMeters: '60' },
    });
    const { series } = split([sprint]);

    expect(series).toHaveLength(1);
    expect(isEditableGroup(series[0])).toBe(true);
    expect(series[0].items).toHaveLength(1);
    expect(series[0].items[0].type).toBe(BlockType.sprint);

    // Round-trip : la donnée du bloc survit à la sérialisation (plus de perte au commit).
    const items = nodesToItems(series);
    const leaf = (items[0] as { items: { params?: Record<string, unknown> }[] }).items[0];
    expect(leaf.params?.distanceMeters).toBe(60);
  });

  it('préserve les groupes existants tels quels et extrait warmup/cooldown', () => {
    const warmup = makeWarmupBlock();
    const group = makeSeriesGroup({
      name: 'Série',
      items: [makeBlock({ type: BlockType.sprint, name: '100 m' })],
    });
    const cooldown = makeCooldownBlock();

    const res = split([warmup, group, cooldown]);
    expect(res.series).toHaveLength(1);
    expect(res.series[0]).toBe(group); // référence inchangée
    expect(res.warmup.type).toBe(BlockType.warmup);
    expect(res.cooldown.type).toBe(BlockType.cooldown);
  });

  it('mélange groupe + bloc top-level : conserve les deux (aucune perte)', () => {
    const group = makeSeriesGroup({
      name: 'Série',
      items: [makeBlock({ type: BlockType.sprint, name: '100 m' })],
    });
    const stray = makeBlock({
      type: BlockType.sprint,
      name: '60 m',
      params: { distanceMeters: '60' },
    });

    const { series } = split([group, stray]);
    expect(series).toHaveLength(2);
    const types = series.map((s: EditableGroup) => s.items[0].type);
    expect(types).toEqual([BlockType.sprint, BlockType.sprint]);
  });

  it('clé du groupe enveloppant dérivée de celle du bloc (pas de remontage de carte)', () => {
    const sprint = makeBlock({ type: BlockType.sprint, name: '60 m' });
    const a = split([sprint]).series[0].key;
    const b = split([sprint]).series[0].key;
    expect(a).toBe(b); // stable d'un rendu à l'autre
    expect(a).toContain(sprint.key);
  });
});

describe('durée d’une borne : secondes du document ⇄ minutes du coach (TLX-259)', () => {
  it('secondes → minutes affichées', () => {
    expect(barDurationMinutes('1500')).toBe('25');
    expect(barDurationMinutes('600')).toBe('10');
  });

  it('durée absente ou non exploitable → champ vide, pas « 0 »', () => {
    // « 0 min » se lirait comme une durée posée à zéro ; l'absence doit rester une absence.
    expect(barDurationMinutes('')).toBe('');
    expect(barDurationMinutes('0')).toBe('');
    expect(barDurationMinutes('abc')).toBe('');
  });

  it('minutes saisies → secondes du modèle éditable', () => {
    expect(barDurationSeconds('25')).toBe('1500');
    expect(barDurationSeconds('8')).toBe('480');
  });

  it('champ vidé → durée effacée (la conservation n’est pas un gel)', () => {
    expect(barDurationSeconds('')).toBe('');
    expect(barDurationSeconds('0')).toBe('');
  });

  it('aller-retour stable sur un compte rond de minutes', () => {
    expect(barDurationSeconds(barDurationMinutes('1500'))).toBe('1500');
  });

  /**
   * Un document importé peut porter une durée qui n'est pas un compte rond de minutes. Le champ
   * est à la minute : il l'affiche arrondie. La valeur stockée, elle, n'est réécrite que si le
   * coach tape — l'affichage seul n'altère rien (cf. l'aller-retour conservateur de TLX-259).
   */
  it('durée non ronde : affichée arrondie, jamais réécrite d’elle-même', () => {
    expect(barDurationMinutes('90')).toBe('2');
  });
});

describe('sanitizeNumeric — filtre des saisies numériques', () => {
  it('entier : ne garde que les chiffres', () => {
    expect(sanitizeNumeric('12ab3', false)).toBe('123');
    expect(sanitizeNumeric('9.5', false)).toBe('95'); // pas de décimal autorisé
    expect(sanitizeNumeric('abc', false)).toBe('');
  });

  it('décimal : chiffres + un seul séparateur (virgule normalisée en point)', () => {
    expect(sanitizeNumeric('9.1ab4', true)).toBe('9.14');
    expect(sanitizeNumeric('1,5', true)).toBe('1.5');
    expect(sanitizeNumeric('1.2.3', true)).toBe('1.23'); // un seul point
    expect(sanitizeNumeric('x', true)).toBe('');
  });
});
