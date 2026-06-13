import {
  PERFORMANCE_CORRECTION_ACTION,
  correctionAudit,
  performanceSnapshot,
} from './performance-correction';

const base = {
  results: { schemaVersion: 1, items: [{ order: 1, timeSeconds: 7.45 }] },
  resultsSchemaVersion: 1,
  rpe: 8,
  notes: 'ok',
};

describe('performance-correction (ADR-33)', () => {
  it('expose l’action d’audit canonique', () => {
    expect(PERFORMANCE_CORRECTION_ACTION).toBe('performance.correction');
  });

  it('normalise rpe/notes absents en null dans le snapshot', () => {
    expect(
      performanceSnapshot({
        results: { items: [] },
        resultsSchemaVersion: 1,
        rpe: null,
        notes: null,
      }),
    ).toEqual({ results: { items: [] }, resultsSchemaVersion: 1, rpe: null, notes: null });
  });

  it('ne trace rien si aucun champ corrigeable ne change', () => {
    expect(correctionAudit(base, { ...base })).toBeNull();
  });

  it('trace la correction d’une marque (results) avec before/after', () => {
    const after = {
      ...base,
      results: { schemaVersion: 1, items: [{ order: 1, timeSeconds: 7.6 }] },
    };
    const diff = correctionAudit(base, after);
    expect(diff).not.toBeNull();
    expect(diff?.before.results).toEqual(base.results);
    expect(diff?.after.results).toEqual(after.results);
  });

  it('trace un changement de RPE seul', () => {
    expect(correctionAudit(base, { ...base, rpe: 7 })).toEqual({
      before: expect.objectContaining({ rpe: 8 }),
      after: expect.objectContaining({ rpe: 7 }),
    });
  });

  it('trace un changement de notes seul', () => {
    expect(correctionAudit(base, { ...base, notes: 'corrigé' })).not.toBeNull();
  });

  it('trace un changement de version de schéma seul', () => {
    expect(correctionAudit(base, { ...base, resultsSchemaVersion: 2 })).not.toBeNull();
  });
});
