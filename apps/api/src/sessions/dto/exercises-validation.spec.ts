import { ValidationPipe, type ArgumentMetadata } from '@nestjs/common';
import { SessionCreateDto } from './session-create.dto';
import { ExerciseDto, ExerciseGroupDto } from './exercises.dto';

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

    const block = result.exercises.items[0] as ExerciseDto;
    expect(block.type).toBe('hurdles');
    // params est un conteneur libre : ses clés ne doivent pas être supprimées par le whitelist.
    expect(block.params).toEqual({ height: 84, spacing: 8.5 });
  });

  it('accepte le type vertical_jumps avec ses params libres (ADR-25)', async () => {
    const result = (await pipe.transform(
      {
        title: 'Hauteur',
        exercises: {
          schemaVersion: 2,
          items: [
            {
              ...baseBlock,
              type: 'vertical_jumps',
              params: { discipline: 'high', startHeightCm: 165, incrementCm: 5 },
            },
          ],
        },
      },
      meta,
    )) as SessionCreateDto;
    const block = result.exercises.items[0] as ExerciseDto;
    expect(block.type).toBe('vertical_jumps');
    expect(block.params).toEqual({ discipline: 'high', startHeightCm: 165, incrementCm: 5 });
  });

  it('accepte un bloc générique sans type (rétro-compat v1)', async () => {
    const result = (await pipe.transform(
      { title: 'Renfo', exercises: { items: [{ ...baseBlock, sets: 3, reps: 10 }] } },
      meta,
    )) as SessionCreateDto;
    expect((result.exercises.items[0] as ExerciseDto).type).toBeUndefined();
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

describe('Contrat exercises v3 — groupes via ValidationPipe (ADR-27)', () => {
  const validGroup = {
    kind: 'group',
    name: 'Contraste force-vitesse',
    order: 2,
    groupType: 'superset',
    rounds: 4,
    restBetweenItemsSeconds: 0,
    restBetweenRoundsSeconds: 240,
    notes: 'Lourd puis explosif.',
    items: [
      { name: 'Squat arrière', order: 3, type: 'strength', reps: 3 },
      { name: 'Bonds horizontaux', order: 4, type: 'jumps', params: { fullJumps: 5 } },
    ],
  };

  const transform = (items: unknown[], schemaVersion = 3) =>
    pipe.transform(
      { title: 'S', exercises: { schemaVersion, items } },
      meta,
    ) as Promise<SessionCreateDto>;

  it('accepte un groupe valide et préserve ses champs + membres (params libres)', async () => {
    const result = await transform([validGroup]);
    const node = result.exercises.items[0] as ExerciseGroupDto;
    expect(node).toBeInstanceOf(ExerciseGroupDto);
    expect(node.kind).toBe('group');
    expect(node.groupType).toBe('superset');
    expect(node.rounds).toBe(4);
    expect(node.restBetweenRoundsSeconds).toBe(240);
    expect(node.items).toHaveLength(2);
    expect(node.items[0]).toMatchObject({ name: 'Squat arrière', type: 'strength', reps: 3 });
    expect(node.items[1].params).toEqual({ fullJumps: 5 });
  });

  it('accepte un document mixte (exercice simple + groupe)', async () => {
    const result = await transform([
      { name: 'Footing', order: 1, type: 'warmup', durationSeconds: 900 },
      validGroup,
    ]);
    expect(result.exercises.items).toHaveLength(2);
    expect((result.exercises.items[0] as { kind?: string }).kind).toBeUndefined();
    expect((result.exercises.items[1] as ExerciseGroupDto).kind).toBe('group');
  });

  it('rejette un groupe imbriqué dans un groupe (un seul niveau par construction)', async () => {
    await expect(transform([{ ...validGroup, items: [validGroup] }])).rejects.toBeDefined();
  });

  it('rejette un champ inconnu sur le groupe (whitelist)', async () => {
    await expect(transform([{ ...validGroup, bogus: 1 }])).rejects.toBeDefined();
  });

  it('rejette un champ inconnu sur un membre du groupe (whitelist)', async () => {
    await expect(
      transform([{ ...validGroup, items: [{ name: 'X', order: 3, bogus: 1 }] }]),
    ).rejects.toBeDefined();
  });

  it('rejette un groupType hors enum', async () => {
    await expect(transform([{ ...validGroup, groupType: 'tabata' }])).rejects.toBeDefined();
  });

  it('rejette un groupe sans rounds (requis)', async () => {
    const { rounds: _rounds, ...withoutRounds } = validGroup;
    await expect(transform([withoutRounds])).rejects.toBeDefined();
  });

  it('rejette rounds < 1', async () => {
    await expect(transform([{ ...validGroup, rounds: 0 }])).rejects.toBeDefined();
  });

  it('rejette un groupe sans items (ArrayMinSize)', async () => {
    await expect(transform([{ ...validGroup, items: [] }])).rejects.toBeDefined();
  });
});
