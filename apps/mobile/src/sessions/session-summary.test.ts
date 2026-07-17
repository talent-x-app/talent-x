import { LoadUnit, type Exercise, type ExerciseGroup } from '@talent-x/api-client';
import {
  formatDistanceVolume,
  formatTonnage,
  sessionKpis,
  sessionPhrase,
  sessionTonnage,
} from './session-summary';

const sprint = (distanceMeters: number, order: number): Exercise => ({
  name: `${distanceMeters} m`,
  order,
  type: 'sprint',
  params: { distanceMeters },
});

const series = (rounds: number, items: Exercise[], order = 1): ExerciseGroup => ({
  kind: 'group',
  name: 'Série',
  order,
  groupType: 'series',
  rounds,
  items,
});

describe('phases exclues des KPIs (TLX-171)', () => {
  const warmup: Exercise = { name: 'Échauffement', order: 1, type: 'warmup' };
  const cooldown: Exercise = { name: 'Retour au calme', order: 3, type: 'cooldown' };

  it('sessionKpis ne compte pas warmup/cooldown comme efforts', () => {
    const kpis = sessionKpis([warmup, sprint(60, 2), cooldown]);
    expect(kpis.efforts).toBe(1); // seul le sprint, pas les phases
  });

  it('sessionPhrase ignore les phases', () => {
    expect(sessionPhrase([warmup, sprint(60, 2), cooldown])).toBe('60 m');
  });
});

describe('sessionPhrase (TLX-160)', () => {
  it('groupe série : « 2 × (30·40·50 m) » (unité factorisée)', () => {
    expect(sessionPhrase([series(2, [sprint(30, 2), sprint(40, 3), sprint(50, 4)])])).toBe(
      '2 × (30·40·50 m)',
    );
  });

  it('plusieurs groupes joints par « + »', () => {
    const phrase = sessionPhrase([
      series(2, [sprint(30, 2), sprint(40, 3), sprint(50, 4)], 1),
      series(3, [sprint(100, 6), sprint(100, 7)], 5),
    ]);
    expect(phrase).toBe('2 × (30·40·50 m) + 3 × (100·100 m)');
  });

  it('feuille seule en distance, sans tours ni parenthèses', () => {
    expect(
      sessionPhrase([
        { name: '5000 m', order: 1, type: 'endurance', params: { distanceMeters: 5000 } },
      ]),
    ).toBe('5000 m');
  });

  it('un seul tour : pas de préfixe « 1 × »', () => {
    expect(sessionPhrase([series(1, [sprint(400, 2)])])).toBe('400 m');
  });

  it('unités mixtes (distance + durée) gardées par valeur', () => {
    const grp = series(2, [
      sprint(30, 2),
      { name: '60 s', order: 3, type: 'interval', params: { workSeconds: 60 } },
    ]);
    expect(sessionPhrase([grp])).toBe('2 × (30m·60s)');
  });

  it('séance vide ou sans mesure → chaîne vide', () => {
    expect(sessionPhrase([])).toBe('');
    expect(sessionPhrase([{ name: 'Renfo', order: 1 }])).toBe('');
  });
});

describe('sessionKpis (TLX-160)', () => {
  it('efforts = tours × feuilles ; volume = somme distances × tours', () => {
    const kpis = sessionKpis([series(2, [sprint(30, 2), sprint(40, 3), sprint(50, 4)])]);
    expect(kpis.efforts).toBe(6);
    expect(kpis.distanceMeters).toBe(240);
  });

  it('combine groupes et feuilles de premier niveau', () => {
    const kpis = sessionKpis([
      series(2, [sprint(100, 2)], 1),
      { name: '5000 m', order: 3, type: 'endurance', params: { distanceMeters: 5000 } },
    ]);
    expect(kpis.efforts).toBe(3); // 2 (groupe) + 1 (feuille)
    expect(kpis.distanceMeters).toBe(5200); // 100×2 + 5000
  });

  it('séance sans distance → volume 0', () => {
    expect(sessionKpis([{ name: 'Gainage', order: 1, type: 'core' }])).toEqual({
      efforts: 1,
      distanceMeters: 0,
    });
  });

  it('feuille de premier niveau avec reps : efforts et volume suivent la cible « N × D »', () => {
    // « 3 × 60m » affiché par formatExerciseTarget → 3 efforts, 180 m (et non 1 effort / 60 m).
    const kpis = sessionKpis([
      { name: '60 m', order: 0, type: 'sprint', params: { distanceMeters: 60, reps: 3 } },
    ]);
    expect(kpis.efforts).toBe(3);
    expect(kpis.distanceMeters).toBe(180);
  });
});

describe('formatDistanceVolume (TLX-160)', () => {
  it('< 1000 m → mètres', () => {
    expect(formatDistanceVolume(540)).toBe('540 m');
  });
  it('≥ 1000 m → km (décimale virgule, entier sans décimale)', () => {
    expect(formatDistanceVolume(1500)).toBe('1,5 km');
    expect(formatDistanceVolume(2000)).toBe('2 km');
  });
  it('0 ou négatif → undefined', () => {
    expect(formatDistanceVolume(0)).toBeUndefined();
  });
});

describe('sessionTonnage (ADR-41 §5)', () => {
  const strength = (
    order: number,
    sets: number,
    reps: number,
    load?: { value: number; unit: LoadUnit },
  ): Exercise => ({ name: 'Squat', order, type: 'strength', sets, reps, load });

  it('top-level kg : tonnage = sets × reps × kg ; repVolume = sets × reps', () => {
    const res = sessionTonnage([strength(1, 4, 5, { value: 100, unit: LoadUnit.kg })]);
    expect(res).toEqual({ tonnageKg: 2000, repVolume: 20 });
  });

  it('%1RM non converti : repVolume seul, tonnage 0', () => {
    const res = sessionTonnage([strength(1, 4, 5, { value: 85, unit: LoadUnit.percent_1rm })]);
    expect(res).toEqual({ tonnageKg: 0, repVolume: 20 });
  });

  it('PPG en groupe : effectif = rounds quand sets absent (core en reps)', () => {
    const grp: ExerciseGroup = {
      kind: 'group',
      name: 'Circuit',
      order: 1,
      groupType: 'circuit',
      rounds: 3,
      items: [{ name: 'Mountain climbers', order: 2, type: 'core', reps: 20 }],
    };
    const res = sessionTonnage([grp]);
    expect(res).toEqual({ tonnageKg: 0, repVolume: 60 }); // 3 tours × 20 reps
  });

  it('ignore les feuilles non strength/core (sprint)', () => {
    const res = sessionTonnage([sprint(100, 1)]);
    expect(res).toEqual({ tonnageKg: 0, repVolume: 0 });
  });
});

describe('formatTonnage (ADR-41 §5)', () => {
  it('< 1000 kg → kg', () => {
    expect(formatTonnage(850)).toBe('850 kg');
  });
  it('≥ 1000 kg → tonnes (virgule décimale, entier sans décimale)', () => {
    expect(formatTonnage(4200)).toBe('4,2 t');
    expect(formatTonnage(2000)).toBe('2 t');
  });
  it('0 ou négatif → undefined', () => {
    expect(formatTonnage(0)).toBeUndefined();
  });
});
