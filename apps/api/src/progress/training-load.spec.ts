import {
  ACWR_MIN_HISTORY_DAYS,
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

/**
 * Témoin d'ancienneté (TLX-260). Ces fixtures s'annoncent « 4 semaines » mais s'étalent des jours
 * 0 à 27, soit **27 jours** écoulés — un de moins que le seuil d'historique. Ce point les porte à
 * 28 jours **sans toucher aux charges** : à exactement 28 jours il tombe hors de la fenêtre
 * chronique (`t <= chronicFrom`), donc il ne contribue ni à `chronic28`, ni à `sessions`, ni à
 * l'ACWR — les valeurs attendues par ces tests (acute 2100, chronic 1050, ACWR 2) sont inchangées.
 *
 * Ce n'est pas un artifice : c'est exactement la distinction que pose le ticket entre
 * l'**ancienneté** de la plus ancienne séance chargée et les **charges retenues** dans la fenêtre.
 */
const WITNESS = at(ACWR_MIN_HISTORY_DAYS, 100);

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
    const points = [
      ...Array.from({ length: 28 }, (_, k) => at(k, k % 2 === 0 ? 90 : 110)),
      WITNESS,
    ];
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
      WITNESS,
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
      WITNESS,
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

/**
 * TLX-260 — seuil d'historique. Le défaut mesuré en QA-02.6 : deux athlètes, des charges dans un
 * rapport de 1 à 5, **le même ACWR 4,00** et « Surcharge » en rouge sur les deux. Ce n'était pas
 * une coïncidence mais une identité — quand tout l'historique tient dans la fenêtre aiguë,
 * `acute === chronic28` et `acwr = acute / (acute / 4) = 4`.
 */
describe('seuil d’historique de 28 jours (TLX-260)', () => {
  it('aucune séance chargée → pas de ratio', () => {
    const r = computeTrainingLoad([], NOW);

    expect(r.acwr).toBeNull();
    expect(r.zone).toBe('insufficient');
  });

  it('historique de 7 jours → pas de ratio, et surtout pas « surcharge »', () => {
    // Le scénario exact du ticket : tout l'historique dans la fenêtre aiguë.
    const points = Array.from({ length: 7 }, (_, k) => at(k, 300));
    const r = computeTrainingLoad(points, NOW);

    expect(r.zone).not.toBe('overload');
    expect(r.zone).toBe('insufficient');
    expect(r.acwr).toBeNull();
    // Les charges, elles, restent mesurées : c'est le **ratio** qui n'est pas interprétable.
    expect(r.acute).toBe(2100);
    expect(r.sessions).toBe(7);
  });

  it('l’identité qui produisait 4,00 ne peut plus s’exprimer, quelle que soit la charge', () => {
    // Deux athlètes de charges très différentes, mêmes 7 jours d'historique : c'est ce couple
    // qui affichait « ACWR 4.00 » deux fois de suite au tableau de bord.
    const light = computeTrainingLoad([at(1, 200)], NOW);
    const heavy = computeTrainingLoad([at(1, 1050)], NOW);

    expect([light.acwr, heavy.acwr]).toEqual([null, null]);
    expect([light.zone, heavy.zone]).toEqual(['insufficient', 'insufficient']);
  });

  it('historique de 30 jours → ratio rendu et zone classée', () => {
    const points = [at(30, 100), ...Array.from({ length: 7 }, (_, k) => at(k, 150))];
    const r = computeTrainingLoad(points, NOW);

    expect(r.acwr).not.toBeNull();
    expect(r.zone).not.toBe('insufficient');
  });

  /**
   * Le piège nommé par l'arbitrage : « 28 jours de données » n'est pas « 28 jours écoulés ». Un
   * compte ancien dont la première séance chargée date d'hier n'a pas d'historique — et le seuil
   * ne peut pas se mesurer sur la date de création du compte, que cette dérivation ne voit pas.
   */
  it('la mesure porte sur la plus ancienne séance chargée, pas sur le nombre de séances', () => {
    // Cinquante séances, toutes tassées sur les deux derniers jours.
    const many = Array.from({ length: 50 }, (_, k) => at(k % 2, 100));

    expect(computeTrainingLoad(many, NOW).zone).toBe('insufficient');
  });

  /**
   * Une séance antérieure à la fenêtre de 28 jours ne compte dans aucune charge (`t <= chronicFrom`)
   * mais **prouve l'ancienneté**. L'ignorer ferait qu'un athlète de deux ans d'historique qui
   * reprend après une coupure repasserait « sans historique » — le seuil ne serait jamais franchi
   * pour lui de façon stable.
   */
  it('une séance hors fenêtre chronique compte comme historique sans compter comme charge', () => {
    const r = computeTrainingLoad([at(60, 500), at(2, 300)], NOW);

    expect(r.sessions).toBe(1); // la séance de J-60 est hors fenêtre de charge
    expect(r.acute).toBe(300);
    expect(r.acwr).not.toBeNull(); // …mais elle établit l'historique
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
