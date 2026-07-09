import { BlockType } from '@talent-x/api-client';
import { makeBlock, makeSeriesGroup } from '../coach/session-builder-ui';
import { buildDetailedTrainingLog, detailedSeed, flattenLeaves } from './free-session-detailed';

/** Tests du mode assistant détaillé du journal libre (TLX-162, ADR-36/38). */

function sprintSerie() {
  return makeSeriesGroup({
    name: 'Série de sprint',
    rounds: '2',
    restBetweenRoundsSeconds: '300',
    items: [
      makeBlock({
        type: BlockType.sprint,
        name: '60 m',
        params: { reps: '1', distanceMeters: '60', intensityValue: '95' },
      }),
      makeBlock({
        type: BlockType.sprint,
        name: '80 m',
        params: { reps: '1', distanceMeters: '80', intensityValue: '90' },
      }),
    ],
  });
}

describe('detailedSeed', () => {
  it('amorce le canvas de la discipline sans échauffement ni retour au calme', () => {
    const nodes = detailedSeed('sprint');
    expect(nodes.length).toBeGreaterThan(0);
    for (const n of nodes) {
      if ('type' in n) {
        expect(n.type).not.toBe(BlockType.warmup);
        expect(n.type).not.toBe(BlockType.cooldown);
      }
    }
  });

  it('discipline inconnue → canvas vide (lecture défensive)', () => {
    expect(detailedSeed('curling')).toEqual([]);
  });
});

describe('buildDetailedTrainingLog', () => {
  it('sérialise le canvas en exercises v3 + results « réalisé » par feuille', () => {
    const body = buildDetailedTrainingLog({
      title: 'Ma séance sprint',
      date: '2026-07-07',
      nodes: [sprintSerie()],
      fallbackTitle: 'Séance Sprint',
      rpe: '7',
      notes: 'bonnes sensations',
    });
    expect(body).not.toBeNull();
    expect(body!.title).toBe('Ma séance sprint');
    expect(body!.date).toBe('2026-07-07');
    // Exercices : doc v3 avec le groupe (ADR-27) — compatible training-log (ADR-36).
    const doc = body!.exercises as { schemaVersion: number; items: unknown[] };
    expect(doc.schemaVersion).toBe(3);
    expect(doc.items).toHaveLength(1);
    // Résultats : une entrée « réalisé » par feuille, alignée nom + order.
    const results = body!.results as {
      schemaVersion: number;
      items: { exerciseName: string; order: number; setResults: unknown[] }[];
    };
    expect(results.schemaVersion).toBe(2);
    expect(results.items).toHaveLength(2);
    expect(results.items[0].exerciseName).toBe('60 m');
    expect(results.items[1].exerciseName).toBe('80 m');
    expect(results.items[0].setResults).toEqual([{ set: 1, completed: true }]);
    expect(body!.rpe).toBe(7);
    expect(body!.notes).toBe('bonnes sensations');
  });

  it('titre vide → repli sur le titre de la discipline ; rpe/notes vides omis', () => {
    const body = buildDetailedTrainingLog({
      title: '   ',
      date: '2026-07-07',
      nodes: [sprintSerie()],
      fallbackTitle: 'Séance Sprint',
      rpe: ' ',
      notes: '',
    });
    expect(body!.title).toBe('Séance Sprint');
    expect(body!.rpe).toBeUndefined();
    expect(body!.notes).toBeUndefined();
  });

  it('canvas sans feuille → null (rien à consigner)', () => {
    expect(
      buildDetailedTrainingLog({
        title: 'x',
        date: '2026-07-07',
        nodes: [],
        fallbackTitle: 'Séance',
      }),
    ).toBeNull();
  });
});

describe('flattenLeaves', () => {
  it('aplati groupes et feuilles top-level dans l’ordre', () => {
    const items = [
      { name: 'Solo', order: 1 },
      {
        name: 'Groupe',
        order: 2,
        groupType: 'series',
        items: [
          { name: 'A', order: 3 },
          { name: 'B', order: 4 },
        ],
      },
    ];
    expect(flattenLeaves(items as never).map((l) => l.name)).toEqual(['Solo', 'A', 'B']);
  });
});
