import { BlockType, type Exercise } from '@talent-x/api-client';

import {
  ATTEMPTS_PER_BAR,
  type BarRow,
  clearedBarHeight,
  entryFromResult,
  entryIsCompleted,
  entryModeFor,
  entryToResult,
  formatMeasures,
  formatTimeInput,
  initialBars,
  initialRowCount,
  makeEmptyEntry,
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

  it('bars : sauts verticaux (hauteur/perche, ADR-25)', () => {
    expect(entryModeFor({ type: BlockType.vertical_jumps })).toBe('bars');
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

describe('grille de barres (mode bars, ADR-25)', () => {
  const cleared = (h: string): BarRow => ({
    height: h,
    attempts: ['cleared', 'none', 'none'],
  });

  it('initialBars : pré-remplit depuis startHeightCm + incrementCm (cm → m)', () => {
    const bars = initialBars(
      ex({ type: BlockType.vertical_jumps, params: { startHeightCm: 165, incrementCm: 5 } }),
    );
    expect(bars.map((b) => b.height)).toEqual(['1.65', '1.7', '1.75', '1.8', '1.85']);
    expect(bars[0].attempts).toEqual(['none', 'none', 'none']);
    expect(bars[0].attempts).toHaveLength(ATTEMPTS_PER_BAR);
  });

  it('initialBars : sans barre de départ → une seule barre vide', () => {
    expect(initialBars(ex({ type: BlockType.vertical_jumps }))).toEqual([
      { height: '', attempts: ['none', 'none', 'none'] },
    ]);
  });

  it('makeEmptyEntry route vers bars pour vertical_jumps', () => {
    const entry = makeEmptyEntry(
      ex({ type: BlockType.vertical_jumps, params: { startHeightCm: 170 } }),
    );
    expect(entry.mode).toBe('bars');
  });

  it('entryToResult : un set par essai tenté, hauteur portée même par un échec', () => {
    const result = entryToResult(ex({ type: BlockType.vertical_jumps, name: 'Hauteur' }), {
      mode: 'bars',
      bars: [
        { height: '1.75', attempts: ['cleared', 'none', 'none'] },
        { height: '1.80', attempts: ['failed', 'cleared', 'none'] },
        { height: '1.85', attempts: ['failed', 'failed', 'failed'] },
        { height: '', attempts: ['cleared', 'none', 'none'] }, // hauteur invalide → ignorée
      ],
    });
    expect(result.setResults).toEqual([
      { set: 1, distanceMeters: 1.75, completed: true },
      { set: 2, distanceMeters: 1.8, failed: true, completed: true },
      { set: 3, distanceMeters: 1.8, completed: true },
      { set: 4, distanceMeters: 1.85, failed: true, completed: true },
      { set: 5, distanceMeters: 1.85, failed: true, completed: true },
      { set: 6, distanceMeters: 1.85, failed: true, completed: true },
    ]);
  });

  it('entryToResult : aucune essai tenté → completed false (repli v1)', () => {
    expect(
      entryToResult(ex({ type: BlockType.vertical_jumps }), {
        mode: 'bars',
        bars: [{ height: '1.50', attempts: ['none', 'none', 'none'] }],
      }).setResults,
    ).toEqual([{ set: 1, completed: false }]);
  });

  it('clearedBarHeight : barre franchie la plus haute, ignore les échecs', () => {
    expect(
      clearedBarHeight({
        mode: 'bars',
        bars: [
          cleared('1.75'),
          cleared('1.80'),
          { height: '1.85', attempts: ['failed', 'failed', 'failed'] },
        ],
      }),
    ).toBe(1.8);
    expect(
      clearedBarHeight({
        mode: 'bars',
        bars: [{ height: '1.85', attempts: ['failed', 'none', 'none'] }],
      }),
    ).toBeUndefined();
  });

  it('entryIsCompleted : au moins un essai sur une barre de hauteur valide', () => {
    expect(
      entryIsCompleted({
        mode: 'bars',
        bars: [{ height: '1.85', attempts: ['failed', 'none', 'none'] }],
      }),
    ).toBe(true);
    expect(
      entryIsCompleted({
        mode: 'bars',
        bars: [{ height: '', attempts: ['cleared', 'none', 'none'] }],
      }),
    ).toBe(false);
    expect(
      entryIsCompleted({
        mode: 'bars',
        bars: [{ height: '1.85', attempts: ['none', 'none', 'none'] }],
      }),
    ).toBe(false);
  });

  it('entryFromResult : regroupe les sets par hauteur en barres (3 essais, padding)', () => {
    const entry = entryFromResult(ex({ type: BlockType.vertical_jumps }), {
      exerciseName: 'X',
      order: 1,
      setResults: [
        { set: 1, distanceMeters: 1.75, completed: true },
        { set: 2, distanceMeters: 1.8, failed: true, completed: true },
        { set: 3, distanceMeters: 1.8, completed: true },
      ],
    });
    expect(entry).toEqual({
      mode: 'bars',
      bars: [
        { height: '1.75', attempts: ['cleared', 'none', 'none'] },
        { height: '1.8', attempts: ['failed', 'cleared', 'none'] },
      ],
    });
  });
});

describe('formatMeasures (grille de barres, ADR-25)', () => {
  it('barre échouée (failed + hauteur) → « X m ✗ », distingue du mordu', () => {
    expect(
      formatMeasures([
        { set: 1, distanceMeters: 1.75, completed: true },
        { set: 2, distanceMeters: 1.85, failed: true, completed: true },
        { set: 3, failed: true }, // sans hauteur → mordu (saut horizontal)
      ]),
    ).toBe('1.75 m · 1.85 m ✗ · mordu');
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
  it('time : ligne vide intercalée préservée en position (tour sauté, ADR-27)', () => {
    const result = entryToResult(ex({ type: BlockType.sprint, name: '60m' }), {
      mode: 'time',
      times: ['7.45', '', '7.62'],
    });
    expect(result.setResults).toEqual([
      { set: 1, timeSeconds: 7.45, completed: true },
      { set: 2, completed: false },
      { set: 3, timeSeconds: 7.62, completed: true },
    ]);
  });

  it('time : lignes vides en queue coupées', () => {
    const result = entryToResult(ex({ type: BlockType.sprint, name: '60m' }), {
      mode: 'time',
      times: ['7.45', '', ''],
    });
    expect(result.setResults).toEqual([{ set: 1, timeSeconds: 7.45, completed: true }]);
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

  it('checklist : comportement v1 inchangé (1 tour)', () => {
    expect(entryToResult(ex({}), { mode: 'checklist', done: [true] }).setResults).toEqual([
      { set: 1, completed: true },
    ]);
  });

  it('checklist N tours (groupe, ADR-27) : un set par tour, position préservée', () => {
    expect(
      entryToResult(ex({}), { mode: 'checklist', done: [true, false, true] }).setResults,
    ).toEqual([
      { set: 1, completed: true },
      { set: 2, completed: false },
      { set: 3, completed: true },
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
    expect(entryIsCompleted({ mode: 'checklist', done: [false] })).toBe(false);
    expect(entryIsCompleted({ mode: 'checklist', done: [false, true] })).toBe(true);
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
    ).toEqual({ mode: 'checklist', done: [true] });
    expect(entryFromResult(ex({}), undefined)).toEqual({ mode: 'checklist', done: [false] });
  });

  it('checklist N tours (groupe, ADR-27) : un booléen par tour saisi', () => {
    expect(
      entryFromResult(ex({}), {
        exerciseName: 'X',
        order: 1,
        setResults: [
          { set: 1, completed: true },
          { set: 2, completed: false },
          { set: 3, completed: true },
        ],
      }),
    ).toEqual({ mode: 'checklist', done: [true, false, true] });
  });

  it('checklist : état vide dimensionné sur rounds (groupe sans perf)', () => {
    expect(entryFromResult(ex({}), undefined, 3)).toEqual({
      mode: 'checklist',
      done: [false, false, false],
    });
  });
});
