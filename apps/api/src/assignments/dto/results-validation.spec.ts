import { ValidationPipe, type ArgumentMetadata } from '@nestjs/common';
import { PerformanceCreateDto } from './performance.dto';

/**
 * Vérifie le contrat results v2 (ADR-19) tel qu'il traverse réellement le `ValidationPipe`
 * global (mêmes options que `main.ts`) : les mesures `timeSeconds`/`distanceMeters`/`failed`
 * sont acceptées et préservées, la rétro-compat v1 tient, et la whitelist rejette toujours
 * les champs inconnus.
 */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

const meta: ArgumentMetadata = { type: 'body', metatype: PerformanceCreateDto, data: '' };

const baseItem = { exerciseName: '8 × 60m', order: 1 };

describe('Contrat results v2 via ValidationPipe (ADR-19)', () => {
  it('accepte un temps mesuré décimal (mode Temps / Intervalles)', async () => {
    const result = (await pipe.transform(
      {
        results: {
          schemaVersion: 2,
          items: [{ ...baseItem, setResults: [{ set: 1, timeSeconds: 7.45, completed: true }] }],
        },
      },
      meta,
    )) as PerformanceCreateDto;

    expect(result.results.items[0].setResults?.[0].timeSeconds).toBe(7.45);
  });

  it('accepte une distance décimale et un essai mordu (mode Essais distance)', async () => {
    const result = (await pipe.transform(
      {
        results: {
          schemaVersion: 2,
          items: [
            {
              ...baseItem,
              setResults: [
                { set: 1, distanceMeters: 6.42 },
                { set: 2, failed: true },
              ],
            },
          ],
        },
      },
      meta,
    )) as PerformanceCreateDto;

    const sets = result.results.items[0].setResults!;
    expect(sets[0].distanceMeters).toBe(6.42);
    expect(sets[1].failed).toBe(true);
    expect(sets[1].distanceMeters).toBeUndefined();
  });

  it('accepte un document v1 inchangé (rétro-compat)', async () => {
    const result = (await pipe.transform(
      {
        results: {
          schemaVersion: 1,
          items: [{ ...baseItem, setResults: [{ set: 1, reps: 10, completed: true }] }],
        },
      },
      meta,
    )) as PerformanceCreateDto;
    expect(result.results.items[0].setResults?.[0].reps).toBe(10);
  });

  it('rejette un temps négatif', async () => {
    await expect(
      pipe.transform(
        { results: { items: [{ ...baseItem, setResults: [{ set: 1, timeSeconds: -1 }] }] } },
        meta,
      ),
    ).rejects.toBeDefined();
  });

  it('rejette un champ inconnu sur une série (whitelist toujours active)', async () => {
    await expect(
      pipe.transform(
        { results: { items: [{ ...baseItem, setResults: [{ set: 1, bogus: 1 }] }] } },
        meta,
      ),
    ).rejects.toBeDefined();
  });
});
