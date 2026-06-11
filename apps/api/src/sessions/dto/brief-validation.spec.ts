import { ValidationPipe, type ArgumentMetadata } from '@nestjs/common';
import { SessionCreateDto } from './session-create.dto';

/**
 * Vérifie le contrat `brief` (ADR-28) tel qu'il traverse le `ValidationPipe` global
 * (mêmes options que `main.ts`). Le brief est entièrement optionnel ; les bornes
 * (difficulty 1..10) et le whitelist (forbidNonWhitelisted) doivent être appliqués.
 */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

const meta: ArgumentMetadata = { type: 'body', metatype: SessionCreateDto, data: '' };
const base = { title: 'Séance', exercises: { items: [] } };

describe('Contrat brief via ValidationPipe (ADR-28)', () => {
  it('accepte une séance sans brief (rétro-compat)', async () => {
    const result = (await pipe.transform({ ...base }, meta)) as SessionCreateDto;
    expect(result.brief).toBeUndefined();
  });

  it('accepte un brief complet et préserve les champs coach-only', async () => {
    const brief = {
      schemaVersion: 1,
      athleteIntent: 'Cours relâché.',
      durationMinutes: 75,
      difficulty: 9,
      successCriteria: "Tenir l'allure.",
      stopCriteria: "Foulée qui s'écrase.",
      intent: 'Tolérance lactique.',
      coachNotes: { regression: 'r', progression: 'p', caution: 'c' },
    };
    const result = (await pipe.transform({ ...base, brief }, meta)) as SessionCreateDto;
    expect(result.brief).toMatchObject(brief);
  });

  it('accepte un brief partiel (un seul champ)', async () => {
    const result = (await pipe.transform(
      { ...base, brief: { difficulty: 5 } },
      meta,
    )) as SessionCreateDto;
    expect(result.brief?.difficulty).toBe(5);
  });

  it('rejette difficulty hors bornes (0 et 11)', async () => {
    await expect(pipe.transform({ ...base, brief: { difficulty: 0 } }, meta)).rejects.toBeDefined();
    await expect(
      pipe.transform({ ...base, brief: { difficulty: 11 } }, meta),
    ).rejects.toBeDefined();
  });

  it('rejette un champ inconnu dans le brief (whitelist)', async () => {
    await expect(pipe.transform({ ...base, brief: { bogus: 1 } }, meta)).rejects.toBeDefined();
  });

  it('rejette un champ inconnu dans coachNotes (whitelist imbriqué)', async () => {
    await expect(
      pipe.transform({ ...base, brief: { coachNotes: { bogus: 1 } } }, meta),
    ).rejects.toBeDefined();
  });
});
