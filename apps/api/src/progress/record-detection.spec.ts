import { bestMeasuresByEvent, eventForExercise, isBetter } from './record-detection';
import { BlockType } from '../sessions/dto/exercises.dto';

describe('record-detection (ADR-20)', () => {
  describe('eventForExercise', () => {
    it('dérive la clé des épreuves chronométrées depuis la distance', () => {
      expect(eventForExercise({ type: BlockType.Sprint, params: { distanceMeters: 60 } })).toEqual({
        eventKey: 'sprint:60m',
        label: '60 m',
        unit: 's',
        direction: 'min',
      });
      expect(
        eventForExercise({ type: BlockType.Hurdles, params: { distanceMeters: 110 } }),
      ).toEqual({ eventKey: 'hurdles:110m', label: '110 m haies', unit: 's', direction: 'min' });
      expect(
        eventForExercise({ type: BlockType.Interval, params: { distanceMeters: 400, reps: 6 } }),
      ).toEqual({ eventKey: 'interval:400m', label: '400 m', unit: 's', direction: 'min' });
    });

    it('sauts et lancers sont des épreuves de distance (max)', () => {
      expect(eventForExercise({ type: BlockType.Jumps })).toEqual({
        eventKey: 'jumps',
        label: 'Saut',
        unit: 'm',
        direction: 'max',
      });
      expect(eventForExercise({ type: BlockType.Throws, params: { implementKg: 7.26 } })).toEqual({
        eventKey: 'throws:7.26kg',
        label: 'Lancer 7.26 kg',
        unit: 'm',
        direction: 'max',
      });
    });

    it('param manquant ou bloc non mesurable → pas d’épreuve (défensif)', () => {
      expect(eventForExercise({ type: BlockType.Sprint })).toBeUndefined(); // sans distance
      expect(eventForExercise({ type: BlockType.Throws })).toBeUndefined(); // sans poids
      expect(eventForExercise({ type: BlockType.Strength })).toBeUndefined();
      expect(eventForExercise({})).toBeUndefined(); // bloc v1 sans type
      expect(
        eventForExercise({ type: BlockType.Sprint, params: { distanceMeters: 'x' } }),
      ).toBeUndefined();
    });
  });

  describe('bestMeasuresByEvent', () => {
    const EXERCISES = [
      { name: '60m', order: 0, type: BlockType.Sprint, params: { distanceMeters: 60 } },
      { name: 'Longueur', order: 1, type: BlockType.Jumps, params: { fullJumps: 4 } },
    ];

    it('garde la meilleure marque par épreuve (min chrono, max distance), ignore les mordus', () => {
      const best = bestMeasuresByEvent(EXERCISES, [
        {
          exerciseName: '60m',
          order: 0,
          setResults: [
            { set: 1, timeSeconds: 7.52, completed: true },
            { set: 2, timeSeconds: 7.45, completed: true },
          ],
        },
        {
          exerciseName: 'Longueur',
          order: 1,
          setResults: [
            { set: 1, distanceMeters: 6.05, completed: true },
            { set: 2, failed: true, completed: true },
            { set: 3, distanceMeters: 6.42, completed: true },
          ],
        },
      ]);
      expect(best).toEqual([
        expect.objectContaining({ eventKey: 'sprint:60m', value: 7.45 }),
        expect.objectContaining({ eventKey: 'jumps', value: 6.42 }),
      ]);
    });

    it('joint par exerciseName puis par order ; résultat orphelin ignoré', () => {
      const best = bestMeasuresByEvent(EXERCISES, [
        { exerciseName: 'renommé', order: 0, setResults: [{ set: 1, timeSeconds: 7.6 }] },
        { exerciseName: 'inconnu', order: 9, setResults: [{ set: 1, timeSeconds: 5 }] },
      ]);
      expect(best).toEqual([expect.objectContaining({ eventKey: 'sprint:60m', value: 7.6 })]);
    });

    it('mesure absente, nulle ou non finie → ignorée ; perf v1 → aucune épreuve', () => {
      expect(
        bestMeasuresByEvent(EXERCISES, [
          { exerciseName: '60m', order: 0, setResults: [{ set: 1, completed: true }] },
          { exerciseName: 'Longueur', order: 1, setResults: [{ set: 1, distanceMeters: 0 }] },
        ]),
      ).toEqual([]);
    });
  });

  describe('isBetter', () => {
    it('min = strictement inférieur, max = strictement supérieur', () => {
      expect(isBetter(7.4, 7.5, 'min')).toBe(true);
      expect(isBetter(7.5, 7.5, 'min')).toBe(false);
      expect(isBetter(6.5, 6.4, 'max')).toBe(true);
      expect(isBetter(6.4, 6.4, 'max')).toBe(false);
    });
  });
});
