import { RESULTS_SCHEMA_VERSION, serializeResults } from './results-schema';
import type { ResultsDocDto } from './dto/results.dto';

const doc = (over: Partial<ResultsDocDto> = {}): ResultsDocDto =>
  ({ items: [{ exerciseName: '60m', order: 1 }], ...over }) as ResultsDocDto;

describe('serializeResults', () => {
  it('pose la colonne ET le JSONB depuis la même version résolue (défaut v2, ADR-19)', () => {
    const write = serializeResults(doc());
    expect(RESULTS_SCHEMA_VERSION).toBe(2);
    expect(write.resultsSchemaVersion).toBe(2);
    expect(write.results).toEqual({
      schemaVersion: 2,
      items: [{ exerciseName: '60m', order: 1 }],
    });
  });

  it('honore une version explicite et la reflète sur la colonne', () => {
    const write = serializeResults(doc({ schemaVersion: 1 }));
    expect(write.resultsSchemaVersion).toBe(1);
    expect((write.results as { schemaVersion: number }).schemaVersion).toBe(1);
  });
});
