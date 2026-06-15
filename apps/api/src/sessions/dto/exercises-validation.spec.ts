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

describe('params additifs par discipline via ValidationPipe (ADR-38)', () => {
  // Le contrat laisse `params` libre (additionalProperties: true) : les clés introduites
  // par l'assistant de création par discipline (ADR-38 §2) doivent traverser le pipe sans
  // être rejetées (forbidNonWhitelisted) ni vidées (whitelist) — aucun bump de schemaVersion.
  const accepts = async (type: string, params: Record<string, unknown>) => {
    const result = (await pipe.transform(
      { title: type, exercises: { schemaVersion: 3, items: [{ ...baseBlock, type, params }] } },
      meta,
    )) as SessionCreateDto;
    return (result.exercises.items[0] as ExerciseDto).params;
  };

  it('sprint : startType / flyingZone / intensityMode / intensityValue / recoveryType préservés', async () => {
    const params = {
      distanceMeters: 30,
      startType: 'blocks',
      flyingZone: false,
      intensityMode: 'percent_record',
      intensityValue: 90,
      // ADR-39 — récup r active/passive de la carte d'effort sprint (additif, params libre).
      recoveryType: 'passive',
    };
    expect(await accepts('sprint', params)).toEqual(params);
  });

  it('hurdles : event / spacingMode / hurdleCount / leadLeg préservés', async () => {
    const params = {
      event: '110mH',
      heightCm: 106.7,
      spacingMode: 'regulation',
      hurdleCount: 10,
      approachMeters: 13.72,
      leadLeg: 'left',
      startType: 'blocks',
      intensityMode: 'target_time',
      intensityValue: 14.2,
    };
    expect(await accepts('hurdles', params)).toEqual(params);
  });

  it('endurance / interval : recoveryType / workSeconds / percentVma / hrZone préservés', async () => {
    const params = {
      recoveryType: 'active',
      workSeconds: 90,
      percentVma: 105,
      specificEvent: '3000m',
      hrZone: 4,
    };
    expect(await accepts('endurance', params)).toEqual(params);
    expect(await accepts('interval', params)).toEqual(params);
  });

  it('jumps : discipline / approach + approachUnit / targetMode / targetPercent préservés', async () => {
    const params = {
      discipline: 'long',
      approach: 18,
      approachUnit: 'steps',
      attempts: 6,
      takeoff: 'left',
      targetMeters: 7.2,
      targetMode: 'percent',
      targetPercent: 95,
    };
    expect(await accepts('jumps', params)).toEqual(params);
  });

  it('jumps : approachMeters legacy reste accepté (rétro-compat ADR-38)', async () => {
    const params = { discipline: 'triple', approachMeters: 38, attempts: 4 };
    expect(await accepts('jumps', params)).toEqual(params);
  });

  it('vertical_jumps : bars / attemptsPerBar / gripCm préservés', async () => {
    const params = {
      discipline: 'pole',
      startHeightCm: 420,
      incrementCm: 10,
      bars: 6,
      attemptsPerBar: 3,
      gripCm: 430,
    };
    expect(await accepts('vertical_jumps', params)).toEqual(params);
  });

  it('throws : discipline / sex / implementState / targetMode / style préservés', async () => {
    const params = {
      discipline: 'shot',
      sex: 'M',
      implementKg: 7.26,
      implementState: 'regulation',
      targetMeters: 18.5,
      targetMode: 'absolute',
      targetPercent: 92,
      style: 'spin',
    };
    expect(await accepts('throws', params)).toEqual(params);
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
