import {
  bestMeasuresByEvent,
  eventForExercise,
  flattenExerciseLeaves,
  isBetter,
} from './record-detection';
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

    it('sauts verticaux (ADR-25) : hauteur par défaut, perche via discipline', () => {
      // Sans param discipline → hauteur (épreuve par défaut).
      expect(eventForExercise({ type: BlockType.VerticalJumps })).toEqual({
        eventKey: 'vertical:high',
        label: 'Hauteur',
        unit: 'm',
        direction: 'max',
      });
      expect(
        eventForExercise({ type: BlockType.VerticalJumps, params: { discipline: 'high' } }),
      ).toEqual({ eventKey: 'vertical:high', label: 'Hauteur', unit: 'm', direction: 'max' });
      expect(
        eventForExercise({ type: BlockType.VerticalJumps, params: { discipline: 'pole' } }),
      ).toEqual({ eventKey: 'vertical:pole', label: 'Perche', unit: 'm', direction: 'max' });
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

    it('grille de barres (ADR-25) : barre franchie = max hauteur non-mordue, pas de collision avec jumps', () => {
      const exercises = [
        {
          name: 'Hauteur',
          order: 0,
          type: BlockType.VerticalJumps,
          params: { discipline: 'high' },
        },
        { name: 'Longueur', order: 1, type: BlockType.Jumps, params: { fullJumps: 3 } },
      ];
      const best = bestMeasuresByEvent(exercises, [
        {
          exerciseName: 'Hauteur',
          order: 0,
          // 1.75 franchie, 1.80 franchie, 1.85 ratée ×2 puis franchie → barre franchie = 1.85.
          setResults: [
            { set: 1, distanceMeters: 1.75, completed: true },
            { set: 2, distanceMeters: 1.8, completed: true },
            { set: 3, distanceMeters: 1.85, failed: true, completed: true },
            { set: 4, distanceMeters: 1.85, failed: true, completed: true },
            { set: 5, distanceMeters: 1.85, completed: true },
          ],
        },
        { exerciseName: 'Longueur', order: 1, setResults: [{ set: 1, distanceMeters: 6.42 }] },
      ]);
      expect(best).toEqual([
        expect.objectContaining({ eventKey: 'vertical:high', value: 1.85 }),
        expect.objectContaining({ eventKey: 'jumps', value: 6.42 }),
      ]);
    });

    it('joint par order puis par exerciseName ; résultat orphelin ignoré', () => {
      const best = bestMeasuresByEvent(EXERCISES, [
        // nom renommé mais order 0 → rejoint le 60m par l'order ; order 9 inconnu → ignoré.
        { exerciseName: 'renommé', order: 0, setResults: [{ set: 1, timeSeconds: 7.6 }] },
        { exerciseName: 'inconnu', order: 9, setResults: [{ set: 1, timeSeconds: 5 }] },
      ]);
      expect(best).toEqual([expect.objectContaining({ eventKey: 'sprint:60m', value: 7.6 })]);
    });

    it('aplatit les feuilles des groupes (ADR-27) et en dérive les épreuves', () => {
      const best = bestMeasuresByEvent(
        [
          {
            kind: 'group',
            name: 'Bloc vitesse',
            order: 0,
            rounds: 3,
            items: [
              { name: 'Sprint', order: 1, type: BlockType.Sprint, params: { distanceMeters: 60 } },
            ],
          },
        ],
        [
          {
            exerciseName: 'Sprint',
            order: 1,
            setResults: [{ set: 1, timeSeconds: 7.1, completed: true }],
          },
        ],
      );
      expect(best).toEqual([expect.objectContaining({ eventKey: 'sprint:60m', value: 7.1 })]);
    });

    it("jointure order-d'abord : désambiguïse des noms dupliqués entre deux groupes (ADR-27)", () => {
      const exercises = [
        {
          kind: 'group',
          name: 'Série 1',
          order: 0,
          rounds: 1,
          items: [
            { name: 'Ligne', order: 1, type: BlockType.Sprint, params: { distanceMeters: 60 } },
          ],
        },
        {
          kind: 'group',
          name: 'Série 2',
          order: 2,
          rounds: 1,
          items: [
            { name: 'Ligne', order: 3, type: BlockType.Sprint, params: { distanceMeters: 150 } },
          ],
        },
      ];
      const best = bestMeasuresByEvent(exercises, [
        {
          exerciseName: 'Ligne',
          order: 1,
          setResults: [{ set: 1, timeSeconds: 7.2, completed: true }],
        },
        {
          exerciseName: 'Ligne',
          order: 3,
          setResults: [{ set: 1, timeSeconds: 18.5, completed: true }],
        },
      ]);
      // Par le nom seul, les deux résultats tomberaient sur la 1re feuille (60m). L'order tranche.
      expect(best).toEqual([
        expect.objectContaining({ eventKey: 'sprint:60m', value: 7.2 }),
        expect.objectContaining({ eventKey: 'sprint:150m', value: 18.5 }),
      ]);
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

  describe('flattenExerciseLeaves (ADR-27)', () => {
    it('remonte les membres des groupes au premier niveau en préservant l’ordre', () => {
      const leaves = flattenExerciseLeaves([
        { name: 'A', order: 0 },
        {
          kind: 'group',
          name: 'G',
          order: 1,
          rounds: 2,
          items: [
            { name: 'B', order: 2 },
            { name: 'C', order: 3 },
          ],
        },
        { name: 'D', order: 4 },
      ]);
      expect(leaves.map((l) => l.name)).toEqual(['A', 'B', 'C', 'D']);
    });

    it('défensif : nœud null et groupe sans items ignorés', () => {
      const leaves = flattenExerciseLeaves([
        null,
        { kind: 'group', name: 'Vide', order: 0, rounds: 1 },
        { name: 'A', order: 1 },
      ]);
      expect(leaves.map((l) => l.name)).toEqual(['A']);
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
