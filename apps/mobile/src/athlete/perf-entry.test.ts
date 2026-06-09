import { BlockType, type Exercise } from '@talent-x/api-client';

import {
  entryFromResult,
  entryIsCompleted,
  entryModeFor,
  entryToResult,
  formatMeasures,
  formatTimeInput,
  initialRowCount,
  parseDistanceInput,
  parseTimeInput,
} from './perf-entry';

function ex(partial: Partial<Exercise>): Exercise {
  return { name: 'X', order: 1, ...partial };
}

describe('entryModeFor (mapping mode ↔ BlockType, ADR-19)', () => {
  it('temps : sprint, haies, endurance, intervalles', () => {
    expect(entryModeFor({ type: BlockType.sprint })).toBe('time');
    expect(entryModeFor({ type: BlockType.hurdles })).toBe('time');
    expect(entryModeFor({ type: BlockType.endurance })).toBe('time');
    expect(entryModeFor({ type: BlockType.interval })).toBe('time');
  });

  it('distance : sauts, lancers', () => {
    expect(entryModeFor({ type: BlockType.jumps })).toBe('distance');
    expect(entryModeFor({ type: BlockType.throws })).toBe('distance');
  });

  it('checklist : musculation, custom, circuit, sans type', () => {
    expect(entryModeFor({ type: BlockType.strength })).toBe('checklist');
    expect(entryModeFor({ type: BlockType.core })).toBe('checklist');
    expect(entryModeFor({})).toBe('checklist');
  });
});

describe('initialRowCount (pré-remplissage depuis la cible — TLX-062/073)', () => {
  it('interval : lignes = params.reps', () => {
    expect(initialRowCount(ex({ type: BlockType.interval, params: { reps: 6 } }))).toBe(6);
  });

  it('sprint sans params : retombe sur sets puis 1', () => {
    expect(initialRowCount(ex({ type: BlockType.sprint, sets: 4 }))).toBe(4);
    expect(initialRowCount(ex({ type: BlockType.sprint }))).toBe(1);
  });

  it('sauts : fullJumps ; lancers : fullThrows ; défaut 3', () => {
    expect(initialRowCount(ex({ type: BlockType.jumps, params: { fullJumps: 6 } }))).toBe(6);
    expect(initialRowCount(ex({ type: BlockType.throws, params: { fullThrows: 4 } }))).toBe(4);
    expect(initialRowCount(ex({ type: BlockType.jumps }))).toBe(3);
  });
});

describe('parseTimeInput / formatTimeInput', () => {
  it('secondes décimales, virgule tolérée', () => {
    expect(parseTimeInput('7.45')).toBe(7.45);
    expect(parseTimeInput('7,45')).toBe(7.45);
    expect(parseTimeInput('75')).toBe(75);
  });

  it('format min:sec (demi-fond)', () => {
    expect(parseTimeInput('1:15.3')).toBeCloseTo(75.3);
    expect(parseTimeInput('2:05')).toBe(125);
  });

  it('rejette vide / invalide / négatif / secondes ≥ 60 après les minutes', () => {
    expect(parseTimeInput('')).toBeUndefined();
    expect(parseTimeInput('abc')).toBeUndefined();
    expect(parseTimeInput('-3')).toBeUndefined();
    expect(parseTimeInput('1:75')).toBeUndefined();
  });

  it('formatTimeInput : aller-retour lisible', () => {
    expect(formatTimeInput(7.45)).toBe('7.45');
    expect(formatTimeInput(75.3)).toBe('1:15.3');
    expect(formatTimeInput(125)).toBe('2:05');
  });
});

describe('parseDistanceInput', () => {
  it('décimal, virgule tolérée, rejette invalide', () => {
    expect(parseDistanceInput('6.42')).toBe(6.42);
    expect(parseDistanceInput('6,42')).toBe(6.42);
    expect(parseDistanceInput('')).toBeUndefined();
    expect(parseDistanceInput('-1')).toBeUndefined();
  });
});

describe('entryToResult (sérialisation results v2)', () => {
  it('time : une ligne par temps valide, lignes vides ignorées', () => {
    const result = entryToResult(ex({ type: BlockType.sprint, name: '60m' }), {
      mode: 'time',
      times: ['7.45', '', '7.62'],
    });
    expect(result.setResults).toEqual([
      { set: 1, timeSeconds: 7.45, completed: true },
      { set: 2, timeSeconds: 7.62, completed: true },
    ]);
  });

  it('distance : essais mesurés + essai mordu sans distance', () => {
    const result = entryToResult(ex({ type: BlockType.jumps }), {
      mode: 'distance',
      attempts: [
        { distance: '6.42', failed: false },
        { distance: '', failed: true },
        { distance: '', failed: false }, // vide → ignoré
      ],
    });
    expect(result.setResults).toEqual([
      { set: 1, distanceMeters: 6.42, completed: true },
      { set: 2, failed: true, completed: true },
    ]);
  });

  it('mode mesuré sans aucune mesure → completed: false (repli v1)', () => {
    const result = entryToResult(ex({ type: BlockType.sprint }), { mode: 'time', times: ['', ''] });
    expect(result.setResults).toEqual([{ set: 1, completed: false }]);
  });

  it('checklist : comportement v1 inchangé', () => {
    expect(entryToResult(ex({}), { mode: 'checklist', done: true }).setResults).toEqual([
      { set: 1, completed: true },
    ]);
  });
});

describe('entryIsCompleted', () => {
  it('au moins une mesure / un mordu / une coche', () => {
    expect(entryIsCompleted({ mode: 'time', times: ['', '8.1'] })).toBe(true);
    expect(entryIsCompleted({ mode: 'time', times: [''] })).toBe(false);
    expect(entryIsCompleted({ mode: 'distance', attempts: [{ distance: '', failed: true }] })).toBe(
      true,
    );
    expect(entryIsCompleted({ mode: 'checklist', done: false })).toBe(false);
  });
});

describe('formatMeasures (revue C-08)', () => {
  it('temps, distance, mordu — libellés lisibles', () => {
    expect(
      formatMeasures([
        { set: 1, timeSeconds: 7.45 },
        { set: 2, timeSeconds: 75.3 },
      ]),
    ).toBe('7.45 s · 1:15.3');
    expect(
      formatMeasures([
        { set: 1, distanceMeters: 6.42 },
        { set: 2, failed: true },
      ]),
    ).toBe('6.42 m · mordu');
  });

  it('undefined sans mesure (perf v1)', () => {
    expect(formatMeasures([{ set: 1, completed: true }])).toBeUndefined();
    expect(formatMeasures(undefined)).toBeUndefined();
  });
});

describe('entryFromResult (réhydratation)', () => {
  it('time : retrouve les temps formatés', () => {
    const entry = entryFromResult(ex({ type: BlockType.interval, params: { reps: 6 } }), {
      exerciseName: 'X',
      order: 1,
      setResults: [
        { set: 1, timeSeconds: 75.3, completed: true },
        { set: 2, timeSeconds: 76, completed: true },
      ],
    });
    expect(entry).toEqual({ mode: 'time', times: ['1:15.3', '1:16'] });
  });

  it('distance : retrouve essais et mordus', () => {
    const entry = entryFromResult(ex({ type: BlockType.throws }), {
      exerciseName: 'X',
      order: 1,
      setResults: [
        { set: 1, distanceMeters: 52.1 },
        { set: 2, failed: true },
      ],
    });
    expect(entry).toEqual({
      mode: 'distance',
      attempts: [
        { distance: '52.1', failed: false },
        { distance: '', failed: true },
      ],
    });
  });

  it('perf v1 sur bloc typé (aucune mesure) → état vide dimensionné sur la cible', () => {
    const entry = entryFromResult(ex({ type: BlockType.interval, params: { reps: 4 } }), {
      exerciseName: 'X',
      order: 1,
      setResults: [{ set: 1, completed: true }],
    });
    expect(entry).toEqual({ mode: 'time', times: ['', '', '', ''] });
  });

  it('checklist : retrouve la coche (rétro-compat v1)', () => {
    expect(
      entryFromResult(ex({}), {
        exerciseName: 'X',
        order: 1,
        setResults: [{ set: 1, completed: true }],
      }),
    ).toEqual({ mode: 'checklist', done: true });
    expect(entryFromResult(ex({}), undefined)).toEqual({ mode: 'checklist', done: false });
  });
});
