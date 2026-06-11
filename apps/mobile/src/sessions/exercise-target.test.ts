import { formatExerciseTarget } from './exercise-target';

// Le client n'est pas mocké : on importe les vraies constantes d'enum (valeurs string).
import { BlockType, LoadUnit, type Exercise } from '@talent-x/api-client';

function ex(partial: Partial<Exercise>): Exercise {
  return { name: 'X', order: 1, ...partial };
}

describe('formatExerciseTarget (TLX-062 — cibles de bloc)', () => {
  it('interval : reps × effort + récup', () => {
    expect(
      formatExerciseTarget(
        ex({
          type: BlockType.interval,
          params: { reps: 6, workSeconds: 90, recoverySeconds: 120 },
        }),
      ),
    ).toBe('6 × 90s · récup 120s');
  });

  it('sprint : reps × distance + récup', () => {
    expect(
      formatExerciseTarget(
        ex({
          type: BlockType.sprint,
          params: { reps: 8, distanceMeters: 60, recoverySeconds: 180 },
        }),
      ),
    ).toBe('8 × 60m · récup 180s');
  });

  it('endurance : distance + allure m:ss/km + dénivelé', () => {
    expect(
      formatExerciseTarget(
        ex({
          type: BlockType.endurance,
          params: { distanceMeters: 5000, paceSecondsPerKm: 300, elevationMeters: 120 },
        }),
      ),
    ).toBe('5000m · 5:00/km · D+120m');
  });

  it('endurance : allure non ronde formatée m:ss', () => {
    expect(
      formatExerciseTarget(ex({ type: BlockType.endurance, params: { paceSecondsPerKm: 225 } })),
    ).toBe('3:45/km');
  });

  it('hurdles : hauteur (décimale), espacement, rythme', () => {
    expect(
      formatExerciseTarget(
        ex({
          type: BlockType.hurdles,
          params: { heightCm: 84, spacingMeters: 8.5, rhythmSteps: 3 },
        }),
      ),
    ).toBe('h 84cm · esp. 8.5m · rythme 3');
  });

  it('jumps : élan, complets, contacts', () => {
    expect(
      formatExerciseTarget(
        ex({
          type: BlockType.jumps,
          params: { approachMeters: 30, fullJumps: 6, plyoContacts: 40 },
        }),
      ),
    ).toBe('élan 30m · 6 complets · 40 contacts');
  });

  it('vertical_jumps : discipline + barre de départ (cm → m) + montée (ADR-25)', () => {
    expect(
      formatExerciseTarget(
        ex({
          type: BlockType.vertical_jumps,
          params: { discipline: 'pole', startHeightCm: 420, incrementCm: 15 },
        }),
      ),
    ).toBe('Perche · départ 4.2 m · +15 cm');
    expect(
      formatExerciseTarget(
        ex({ type: BlockType.vertical_jumps, params: { discipline: 'high', startHeightCm: 165 } }),
      ),
    ).toBe('Hauteur · départ 1.65 m');
  });

  it('throws : engin (kg) + technique/complets', () => {
    expect(
      formatExerciseTarget(
        ex({
          type: BlockType.throws,
          params: { implementKg: 7.26, techniqueThrows: 10, fullThrows: 6 },
        }),
      ),
    ).toBe('7.26 kg · 10 tech + 6 complets');
  });

  it('circuit (core) : tours × durée par station', () => {
    expect(
      formatExerciseTarget(ex({ type: BlockType.core, params: { rounds: 3, stationSeconds: 45 } })),
    ).toBe('3 tours × 45s');
  });

  it('warmup/cooldown partagent le format circuit', () => {
    expect(formatExerciseTarget(ex({ type: BlockType.warmup, params: { rounds: 2 } }))).toBe(
      '2 tours',
    );
    expect(
      formatExerciseTarget(ex({ type: BlockType.cooldown, params: { stationSeconds: 60 } })),
    ).toBe('60s');
  });

  it('strength : base v1 (séries × reps × charge)', () => {
    expect(
      formatExerciseTarget(
        ex({ type: BlockType.strength, sets: 5, reps: 3, load: { value: 80, unit: LoadUnit.kg } }),
      ),
    ).toBe('5 × 3 · 80 kg');
  });

  it('interval/sprint : intensité % VMA insérée avant la récup (ADR-28 règle 6)', () => {
    expect(
      formatExerciseTarget(
        ex({
          type: BlockType.interval,
          params: { reps: 6, workSeconds: 90, recoverySeconds: 120, percentVma: 105 },
        }),
      ),
    ).toBe('6 × 90s · 105 % VMA · récup 120s');
    expect(
      formatExerciseTarget(
        ex({ type: BlockType.sprint, params: { reps: 8, distanceMeters: 60, percentVma: 120 } }),
      ),
    ).toBe('8 × 60m · 120 % VMA');
  });

  it('strength : tempo ajouté à la base v1 (ADR-28 règle 6)', () => {
    expect(
      formatExerciseTarget(
        ex({
          type: BlockType.strength,
          sets: 5,
          reps: 3,
          load: { value: 80, unit: LoadUnit.kg },
          params: { tempo: '3-1-1-0' },
        }),
      ),
    ).toBe('5 × 3 · 80 kg · tempo 3-1-1-0');
    // Tempo seul (base v1 vide) : la cible reste lisible.
    expect(formatExerciseTarget(ex({ type: BlockType.strength, params: { tempo: '30X0' } }))).toBe(
      'tempo 30X0',
    );
  });

  it('custom sans type : base commune', () => {
    expect(formatExerciseTarget(ex({ sets: 4, durationSeconds: 30 }))).toBe('4 × 30s');
    expect(formatExerciseTarget(ex({ reps: 12 }))).toBe('12 reps');
  });

  it('repli : type typé mais params vides → base commune', () => {
    expect(formatExerciseTarget(ex({ type: BlockType.sprint, sets: 3, reps: 5 }))).toBe('3 × 5');
  });

  it('cas vide : aucune donnée → tiret', () => {
    expect(formatExerciseTarget(ex({}))).toBe('—');
    expect(formatExerciseTarget(ex({ type: BlockType.jumps }))).toBe('—');
  });

  it('lecture défensive : param non numérique ignoré', () => {
    expect(
      formatExerciseTarget(
        ex({ type: BlockType.interval, params: { reps: 'six', workSeconds: 90 } as never }),
      ),
    ).toBe('90s');
    // Tempo non textuel ignoré → repli sur la base v1.
    expect(
      formatExerciseTarget(
        ex({ type: BlockType.strength, sets: 5, reps: 3, params: { tempo: 42 } as never }),
      ),
    ).toBe('5 × 3');
  });
});
