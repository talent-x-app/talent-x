import { BlockType, type Exercise, type PersonalRecord } from '@talent-x/api-client';
import {
  exerciseEventKey,
  formatTargetForView,
  hasPercentRecordTargets,
  individualizedTarget,
  percentRecordIntensity,
} from './individualized-target';

/** Tests de la dérivation de cibles individualisées (TLX-161, ADR-38/20). */

function sprint(params: Record<string, unknown>): Exercise {
  return { name: 'Sprint', order: 1, type: BlockType.sprint, params } as Exercise;
}

function record(eventKey: string, value: number, unit: 's' | 'm' = 's'): PersonalRecord {
  return {
    id: `r-${eventKey}`,
    athleteId: 'u-1',
    eventKey,
    label: eventKey,
    value,
    unit,
    direction: unit === 's' ? 'min' : 'max',
    achievedAt: '2026-06-01T00:00:00Z',
  } as PersonalRecord;
}

describe('exerciseEventKey', () => {
  it('compose la clé canonique des familles chronométrées (alignée record-detection)', () => {
    expect(exerciseEventKey(sprint({ distanceMeters: 60 }))).toBe('sprint:60m');
    expect(
      exerciseEventKey({
        name: 'Haies',
        order: 1,
        type: BlockType.hurdles,
        params: { distanceMeters: 110 },
      } as Exercise),
    ).toBe('hurdles:110m');
  });

  it('refuse hors famille chronométrée ou sans distance', () => {
    expect(exerciseEventKey(sprint({}))).toBeUndefined();
    expect(
      exerciseEventKey({
        name: 'Squat',
        order: 1,
        type: BlockType.strength,
        params: {},
      } as Exercise),
    ).toBeUndefined();
    expect(exerciseEventKey(sprint({ distanceMeters: 'soixante' }))).toBeUndefined();
  });
});

describe('individualizedTarget', () => {
  const REC = [record('sprint:60m', 7.32)];

  it('dérive la cible : record / (intensité/100), arrondie au centième', () => {
    const t = individualizedTarget(
      sprint({ distanceMeters: 60, intensityMode: 'percent_record', intensityValue: 95 }),
      REC,
    );
    // 7,32 / 0,95 = 7,7052… → 7,71 s (plus lent que le record, cohérent à 95 %).
    expect(t).toEqual({ seconds: 7.71, recordSeconds: 7.32, percent: 95 });
  });

  it('repli propre : pas de record pour l’épreuve, mauvais mode, ou unité non chronométrée', () => {
    const ex = sprint({ distanceMeters: 100, intensityMode: 'percent_record', intensityValue: 95 });
    expect(individualizedTarget(ex, REC)).toBeUndefined(); // record 60m seulement
    expect(
      individualizedTarget(
        sprint({ distanceMeters: 60, intensityMode: 'target_time', intensityValue: 8 }),
        REC,
      ),
    ).toBeUndefined();
    expect(
      individualizedTarget(
        sprint({ distanceMeters: 60, intensityMode: 'percent_record', intensityValue: 95 }),
        [record('sprint:60m', 6.4, 'm')],
      ),
    ).toBeUndefined();
  });
});

describe('formatTargetForView', () => {
  const REC = [record('sprint:60m', 7.32)];
  const EX = sprint({
    distanceMeters: 60,
    reps: 3,
    intensityMode: 'percent_record',
    intensityValue: 95,
  });

  it('vue coach : prescription « % record »', () => {
    expect(formatTargetForView(EX, 'coach', REC)).toBe('3 × 60m · 95 % record');
  });

  it('vue athlète : cible individualisée « ≈ … s »', () => {
    expect(formatTargetForView(EX, 'athlete', REC)).toBe('3 × 60m · ≈ 7.71 s');
  });

  it('vue athlète sans record correspondant : repli sur la prescription (jamais d’erreur)', () => {
    expect(formatTargetForView(EX, 'athlete', [])).toBe('3 × 60m · 95 % record');
  });

  it('sans intensité % record : les deux vues rendent la cible standard', () => {
    const plain = sprint({ distanceMeters: 60, reps: 3 });
    expect(formatTargetForView(plain, 'coach', REC)).toBe('3 × 60m');
    expect(formatTargetForView(plain, 'athlete', REC)).toBe('3 × 60m');
  });
});

describe('hasPercentRecordTargets', () => {
  it('détecte au moins une intensité % record', () => {
    expect(
      hasPercentRecordTargets([
        sprint({ distanceMeters: 60 }),
        sprint({ distanceMeters: 60, intensityMode: 'percent_record', intensityValue: 90 }),
      ]),
    ).toBe(true);
    expect(hasPercentRecordTargets([sprint({ distanceMeters: 60 })])).toBe(false);
    expect(percentRecordIntensity(sprint({ intensityMode: 'percent_record' }))).toBeUndefined();
  });
});
