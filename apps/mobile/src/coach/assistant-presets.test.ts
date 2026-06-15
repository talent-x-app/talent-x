import { nodesToItems } from './session-builder-ui';
import {
  assistantPresets,
  assistantSeed,
  hurdleRaceDistance,
  regulationImplementKg,
} from './assistant-presets';

/** Sérialise le 1er effort du 1er preset d'une discipline → feuille `Exercise` v3. */
function firstEffort(discipline: string, presetKey: string) {
  const preset = assistantPresets(discipline).find((p) => p.key === presetKey);
  if (!preset) throw new Error(`preset introuvable: ${discipline}/${presetKey}`);
  const items = nodesToItems(preset.build());
  const group = items[0] as { kind?: string; items: unknown[] };
  return group.items[0] as { type?: string; params?: Record<string, unknown> };
}

describe('hurdleRaceDistance (TLX-156)', () => {
  it('110 m haies réglementaire = 13,72 + 9×9,14 + 14,02 = 110', () => {
    expect(hurdleRaceDistance(13.72, 9.14, 10, 14.02)).toBe(110);
  });
  it('100 m haies réglementaire = 100', () => {
    expect(hurdleRaceDistance(13, 8.5, 10, 10.5)).toBe(100);
  });
  it('400 m haies réglementaire = 400', () => {
    expect(hurdleRaceDistance(45, 35, 10, 40)).toBe(400);
  });
  it('une seule haie : pas d’intervalle entre haies', () => {
    expect(hurdleRaceDistance(13.72, 9.14, 1, 5)).toBe(18.72);
  });
});

describe('regulationImplementKg (TLX-159)', () => {
  it('poids : 7,26 kg (H) / 4 kg (F)', () => {
    expect(regulationImplementKg('shot', 'M')).toBe(7.26);
    expect(regulationImplementKg('shot', 'F')).toBe(4);
  });
  it('javelot : 0,8 (H) / 0,6 (F) ; disque 2/1', () => {
    expect(regulationImplementKg('javelin', 'M')).toBe(0.8);
    expect(regulationImplementKg('javelin', 'F')).toBe(0.6);
    expect(regulationImplementKg('discus', 'F')).toBe(1);
  });
  it('discipline inconnue → undefined', () => {
    expect(regulationImplementKg('bogus', 'M')).toBeUndefined();
  });
});

describe('assistantSeed — amorce une série typée par discipline (ADR-38)', () => {
  it('produit une série (groupe) avec un effort du bon type', () => {
    const items = nodesToItems(assistantSeed('hurdles'));
    const group = items[0] as { kind?: string; groupType?: string; items: { type?: string }[] };
    expect(group.kind).toBe('group');
    expect(group.groupType).toBe('series');
    expect(group.items[0].type).toBe('hurdles');
  });
  it('discipline inconnue → aucune amorce', () => {
    expect(assistantSeed('bogus')).toEqual([]);
  });
});

describe('presets par discipline — sérialisation v3 (TLX-156→159)', () => {
  it('haies : distance de course dérivée = distance d’épreuve (110mH → 110 m)', () => {
    const effort = firstEffort('hurdles', 'h110');
    expect(effort.type).toBe('hurdles');
    expect(effort.params).toMatchObject({ event: '110mH', distanceMeters: 110, heightCm: 106.7 });
  });

  it('endurance : preset distance → type endurance', () => {
    const effort = firstEffort('endurance', 'threshold');
    expect(effort.type).toBe('endurance');
    expect(effort.params).toMatchObject({ distanceMeters: 2000, percentVma: 85 });
  });

  it('endurance : preset durée (30/30) → type interval', () => {
    const effort = firstEffort('endurance', 'vma_short');
    expect(effort.type).toBe('interval');
    expect(effort.params).toMatchObject({
      workSeconds: 30,
      recoverySeconds: 30,
      distanceMeters: 150,
    });
  });

  it('sauts horizontaux : longueur → type jumps (approach + approachUnit)', () => {
    const effort = firstEffort('jumps', 'long_full');
    expect(effort.type).toBe('jumps');
    expect(effort.params).toMatchObject({
      discipline: 'long',
      approach: 18,
      approachUnit: 'steps',
    });
  });

  it('sauts verticaux : hauteur → type vertical_jumps (grille de barres, ADR-25)', () => {
    const effort = firstEffort('jumps', 'high');
    expect(effort.type).toBe('vertical_jumps');
    expect(effort.params).toMatchObject({ discipline: 'high', startHeightCm: 165, bars: 6 });
  });

  it('lancers : poids réglementaire dérivé de discipline + sexe', () => {
    const effort = firstEffort('throws', 'shot_technique');
    expect(effort.type).toBe('throws');
    expect(effort.params).toMatchObject({ discipline: 'shot', sex: 'M', implementKg: 7.26 });
  });
});
