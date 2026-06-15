import { type Exercise, type ExerciseGroup } from '@talent-x/api-client';
import { formatDistanceVolume, sessionKpis, sessionPhrase } from './session-summary';

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
