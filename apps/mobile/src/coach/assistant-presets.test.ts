import { nodesToItems } from './session-builder-ui';
import {
  assistantPresets,
  assistantSeed,
  hurdleRaceDistance,
  regulationImplementKg,
  targetLoadFromOneRm,
  ONE_RM_REFERENCE,
  EXERCISE_LABELS,
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

describe('targetLoadFromOneRm (ADR-41 §4)', () => {
  it('charge cible = 1RM × % ⁄ 100 (arrondie)', () => {
    expect(targetLoadFromOneRm('squat', 85)).toBe(119); // 140 × 0,85
    expect(targetLoadFromOneRm('deadlift', 80)).toBe(128); // 160 × 0,80
  });
  it('exercice inconnu → undefined', () => {
    expect(targetLoadFromOneRm('bogus', 90)).toBeUndefined();
  });
  it('table et libellés couvrent les mêmes clés', () => {
    expect(Object.keys(ONE_RM_REFERENCE).sort()).toEqual(Object.keys(EXERCISE_LABELS).sort());
  });
});

describe('presets Renforcement / PPG (ADR-41 §7)', () => {
  it('Muscu (force_max) : blocs strength top-level, sets/reps/charge %1RM conservés', () => {
    const preset = assistantPresets('strength').find((p) => p.key === 'force_max');
    const items = nodesToItems(preset!.build());
    expect(items).toHaveLength(2);
    const squat = items[0] as {
      type?: string;
      sets?: number;
      reps?: number;
      load?: { value: number; unit: string };
      params?: Record<string, unknown>;
    };
    expect(squat.type).toBe('strength');
    expect(squat.sets).toBe(4); // sets visible car bloc top-level (pas en groupe)
    expect(squat.reps).toBe(5);
    expect(squat.load).toEqual({ value: 85, unit: 'percent_1rm' });
    expect(squat.params).toMatchObject({ exerciseKey: 'squat', tempo: '31X1' });
  });

  it('Pliométrie : charge poids de corps (pas de valeur)', () => {
    const preset = assistantPresets('strength').find((p) => p.key === 'plyo');
    const items = nodesToItems(preset!.build());
    const block = items[0] as { load?: unknown };
    // load.unit bodyweight sans value → non sérialisé (contrat Load exige value+unit).
    expect(block.load).toBeUndefined();
  });

  it('PPG (circuit_ppg) : groupe circuit de stations core (travail en durée + récup)', () => {
    const preset = assistantPresets('strength').find((p) => p.key === 'circuit_ppg');
    const nodes = preset!.build();
    // Forme éditable (avant sérialisation) : les stations portent travail/récup en base.
    const group = nodes[0] as {
      kind?: string;
      groupType?: string;
      rounds: string;
      items: { type?: string; name: string; durationSeconds: string; restSeconds: string }[];
    };
    expect(group.kind).toBe('group');
    expect(group.groupType).toBe('circuit');
    expect(group.rounds).toBe('3');
    expect(group.items).toHaveLength(6);
    expect(group.items[0].type).toBe('core');
    expect(group.items[0].durationSeconds).toBe('40');
    expect(group.items[0].restSeconds).toBe('20');
    // Sérialisation : tours portés par `rounds` du groupe (sets masqué en groupe), récup conservée.
    const serialized = nodesToItems(nodes)[0] as {
      rounds?: number;
      items: { restSeconds?: number; sets?: number }[];
    };
    expect(serialized.rounds).toBe(3);
    expect(serialized.items[0].restSeconds).toBe(20);
    expect(serialized.items[0].sets).toBeUndefined();
  });

  it('Gainage (core_ppg) : station en reps (forme éditable)', () => {
    const preset = assistantPresets('strength').find((p) => p.key === 'core_ppg');
    const nodes = preset!.build();
    const group = nodes[0] as { items: { name: string; reps: string }[] };
    const mc = group.items.find((s) => s.name === 'Mountain climbers');
    expect(mc?.reps).toBe('20');
  });

  it('seed strength : échauffement + blocs muscu + retour au calme', () => {
    const items = nodesToItems(assistantSeed('strength'));
    const types = items.map((n) => (n as { type?: string }).type);
    expect(types[0]).toBe('warmup');
    expect(types[types.length - 1]).toBe('cooldown');
    expect(types).toContain('strength');
  });
});
