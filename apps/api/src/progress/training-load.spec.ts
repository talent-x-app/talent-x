import {
  classifyZone,
  computeTrainingLoad,
  plannedDurationMinutes,
  sessionLoad,
  type LoadPoint,
} from './training-load';

const NOW = new Date('2026-06-29T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
/** Charge datée à `daysAgo` jours de NOW. */
const at = (daysAgo: number, load: number): LoadPoint => ({
  date: new Date(NOW.getTime() - daysAgo * DAY),
  load,
});

describe('sessionLoad (sRPE = RPE × durée)', () => {
  it('multiplie RPE par la durée', () => {
    expect(sessionLoad(7, 60)).toBe(420);
  });
  it('null si RPE ou durée manque / non exploitable', () => {
    expect(sessionLoad(null, 60)).toBeNull();
    expect(sessionLoad(7, null)).toBeNull();
    expect(sessionLoad(0, 60)).toBeNull();
    expect(sessionLoad(7, 0)).toBeNull();
    expect(sessionLoad(7, -10)).toBeNull();
    expect(sessionLoad(undefined, undefined)).toBeNull();
  });
});

describe('plannedDurationMinutes', () => {
  it('priorité au brief.durationMinutes', () => {
    expect(
      plannedDurationMinutes({ durationMinutes: 75 }, { items: [{ durationSeconds: 600 }] }),
    ).toBe(75);
  });
  it('repli sur la somme des durationSeconds des blocs (÷ 60, arrondi)', () => {
    expect(
      plannedDurationMinutes(null, { items: [{ durationSeconds: 900 }, { durationSeconds: 300 }] }),
    ).toBe(20);
  });
  it('brief à 0 ou absent → repli exercices', () => {
    expect(
      plannedDurationMinutes({ durationMinutes: 0 }, { items: [{ durationSeconds: 1200 }] }),
    ).toBe(20);
  });
  it('null si aucune source exploitable', () => {
    expect(plannedDurationMinutes(null, null)).toBeNull();
    expect(plannedDurationMinutes({}, { items: [] })).toBeNull();
    expect(plannedDurationMinutes({}, { items: [{}] })).toBeNull();
  });
});

describe('computeTrainingLoad — ACWR & zones', () => {
  it('aucune donnée → insufficient, ACWR null, charges nulles', () => {
    const r = computeTrainingLoad([], NOW);
    expect(r).toMatchObject({
      acute: 0,
      chronic: 0,
      acwr: null,
      zone: 'insufficient',
      sessions: 0,
    });
    expect(r.monotony).toBeNull();
    expect(r.strain).toBeNull();
  });

  it('charge stable 4 semaines → ACWR ≈ 1.0, zone optimal', () => {
    // ~100/jour sur 28 jours (variation légère pour une monotonie définie).
    const points = Array.from({ length: 28 }, (_, k) => at(k, k % 2 === 0 ? 90 : 110));
    const r = computeTrainingLoad(points, NOW);
    expect(r.zone).toBe('optimal');
    expect(r.acwr).toBeGreaterThanOrEqual(0.8);
    expect(r.acwr).toBeLessThanOrEqual(1.3);
    expect(r.monotony).not.toBeNull();
  });

  it('pic de charge sur 7 jours → surcharge (ACWR > 1.3)', () => {
    const points = [
      ...Array.from({ length: 7 }, (_, k) => at(k, 300)), // semaine en cours, lourde
      ...Array.from({ length: 21 }, (_, k) => at(k + 7, 100)), // 3 semaines précédentes
    ];
    const r = computeTrainingLoad(points, NOW);
    expect(r.acute).toBe(2100);
    expect(r.chronic).toBe(1050); // (2100 + 2100) / 4
    expect(r.acwr).toBe(2);
    expect(r.zone).toBe('overload');
  });

  it('semaine allégée → sous-charge (ACWR < 0.8)', () => {
    const points = [
      ...Array.from({ length: 7 }, (_, k) => at(k, 50)),
      ...Array.from({ length: 21 }, (_, k) => at(k + 7, 200)),
    ];
    const r = computeTrainingLoad(points, NOW);
    expect(r.acute).toBe(350);
    expect(r.zone).toBe('underload');
    expect(r.acwr).toBeLessThan(0.8);
  });

  it('ignore les points hors fenêtre 28 j et dans le futur', () => {
    const points = [at(3, 100), at(40, 9999), at(-2, 9999)];
    const r = computeTrainingLoad(points, NOW);
    expect(r.sessions).toBe(1);
    expect(r.acute).toBe(100);
  });

  it('monotonie : charge concentrée sur un jour → monotonie élevée + contrainte', () => {
    const r = computeTrainingLoad([at(0, 700)], NOW);
    // Un seul jour chargé sur 7 → mean=100, forte dispersion → monotonie définie.
    expect(r.monotony).not.toBeNull();
    expect(r.strain).not.toBeNull();
    expect(r.strain).toBe(Math.round(700 * (r.monotony as number)));
  });
});

describe('classifyZone — bornes de la zone sûre 0.8–1.3', () => {
  it('bornes incluses dans optimal', () => {
    expect(classifyZone(0.8, 100)).toBe('optimal');
    expect(classifyZone(1.3, 100)).toBe('optimal');
  });
  it('hors bornes', () => {
    expect(classifyZone(0.79, 100)).toBe('underload');
    expect(classifyZone(1.31, 100)).toBe('overload');
  });
  it('insufficient si ACWR null ou chronique nulle', () => {
    expect(classifyZone(null, 100)).toBe('insufficient');
    expect(classifyZone(1.0, 0)).toBe('insufficient');
  });
});
