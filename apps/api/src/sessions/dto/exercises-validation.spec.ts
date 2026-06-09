import { ValidationPipe, type ArgumentMetadata } from '@nestjs/common';
import { SessionCreateDto } from './session-create.dto';

/**
 * Vérifie le contrat v2 (ADR-18) tel qu'il traverse réellement le `ValidationPipe`
 * global (mêmes options que `main.ts` : whitelist + forbidNonWhitelisted + transform).
 * C'est le point que les tests de service — qui appellent le service directement —
 * ne couvrent pas : le pipe accepte-t-il `type`/`params` sans les rejeter ni les vider ?
 */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

const meta: ArgumentMetadata = { type: 'body', metatype: SessionCreateDto, data: '' };

const baseBlock = { name: 'Bloc', order: 1 };

describe('Contrat exercises v2 via ValidationPipe (ADR-18)', () => {
  it('accepte un bloc typé avec params libres et les préserve', async () => {
    const result = (await pipe.transform(
      {
        title: 'Haies',
        exercises: {
          schemaVersion: 2,
          items: [{ ...baseBlock, type: 'hurdles', params: { height: 84, spacing: 8.5 } }],
        },
      },
      meta,
    )) as SessionCreateDto;

    const block = result.exercises.items[0];
    expect(block.type).toBe('hurdles');
    // params est un conteneur libre : ses clés ne doivent pas être supprimées par le whitelist.
    expect(block.params).toEqual({ height: 84, spacing: 8.5 });
  });

  it('accepte un bloc générique sans type (rétro-compat v1)', async () => {
    const result = (await pipe.transform(
      { title: 'Renfo', exercises: { items: [{ ...baseBlock, sets: 3, reps: 10 }] } },
      meta,
    )) as SessionCreateDto;
    expect(result.exercises.items[0].type).toBeUndefined();
  });

  it('rejette un type hors enum BlockType', async () => {
    await expect(
      pipe.transform(
        { title: 'X', exercises: { items: [{ ...baseBlock, type: 'not-a-discipline' }] } },
        meta,
      ),
    ).rejects.toBeDefined();
  });

  it('rejette un champ inconnu au niveau du bloc (whitelist toujours active)', async () => {
    await expect(
      pipe.transform({ title: 'X', exercises: { items: [{ ...baseBlock, bogusField: 1 }] } }, meta),
    ).rejects.toBeDefined();
  });
});
