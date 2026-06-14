import {
  EXERCISES_SCHEMA_VERSION,
  serializeExercises,
  storedExercisesSchemaVersion,
} from './exercises-schema';
import type { ExercisesDocDto } from './dto/exercises.dto';

const doc = (over: Partial<ExercisesDocDto> = {}): ExercisesDocDto =>
  ({ items: [{ name: '60m', order: 0 }], ...over }) as ExercisesDocDto;

describe('serializeExercises', () => {
  it('pose la colonne ET le JSONB depuis la même version résolue (défaut v2)', () => {
    const write = serializeExercises(doc());
    expect(write.exercisesSchemaVersion).toBe(EXERCISES_SCHEMA_VERSION);
    expect(write.exercises).toEqual({
      schemaVersion: EXERCISES_SCHEMA_VERSION,
      items: [{ name: '60m', order: 0 }],
    });
  });

  it('honore une version explicite et la reflète sur la colonne (jamais de dérive)', () => {
    const write = serializeExercises(doc({ schemaVersion: 3 }));
    expect(write.exercisesSchemaVersion).toBe(3);
    expect((write.exercises as { schemaVersion: number }).schemaVersion).toBe(3);
  });
});

describe('storedExercisesSchemaVersion', () => {
  it('lit le tag du JSONB en priorité (source de vérité)', () => {
    expect(
      storedExercisesSchemaVersion({
        exercises: { schemaVersion: 3, items: [] },
        exercisesSchemaVersion: 1,
      }),
    ).toBe(3);
  });

  it('retombe sur la colonne pour une ligne héritée sans tag JSON', () => {
    expect(
      storedExercisesSchemaVersion({ exercises: { items: [] }, exercisesSchemaVersion: 2 }),
    ).toBe(2);
    expect(storedExercisesSchemaVersion({ exercises: null, exercisesSchemaVersion: 1 })).toBe(1);
  });
});
