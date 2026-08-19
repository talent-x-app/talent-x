import { QueryObserver } from '@tanstack/react-query';
import { createQueryClient } from './query-client';

/**
 * TLX-240 — le préchauffage du cache de confirmation (A-05).
 *
 * `SessionDetailScreen.onSuccess` invalide `['assignment', id]` **puis** écrit la perf sous
 * `['assignment', id, 'performance']`, en annonçant « pas d'appel réseau supplémentaire ».
 * L'invalidation emportant cette clé par préfixe, le soupçon était que l'écriture soit
 * défaite et qu'une requête reparte quand même — c'est ce qu'on observe sous un client de
 * test, dont le `staleTime` vaut 0 et rend toute entrée immédiatement périmée.
 *
 * Ce n'est pas ce qui se passe dans l'app : `setQueryData` lève le drapeau d'invalidation et
 * remet `dataUpdatedAt` à l'heure, et `createQueryClient` pose `staleTime: 30_000`. L'écran
 * de confirmation monte donc sur une entrée fraîche et ne redemande rien.
 *
 * D'où ce test sur le **vrai** client : la promesse du commentaire dépend d'un réglage qui
 * vit dans un autre fichier, et rien ne la protégeait d'un passage de `staleTime` à 0.
 */
describe('createQueryClient — préchauffage du cache (TLX-240)', () => {
  const PERF_KEY = ['assignment', 'asg-1', 'performance'] as const;

  /** Rejoue la séquence d'`onSuccess`, puis monte un observateur comme le fait A-05. */
  async function mountAfterSubmit(client: ReturnType<typeof createQueryClient>) {
    void client.invalidateQueries({ queryKey: ['assignments'] });
    void client.invalidateQueries({ queryKey: ['assignment', 'asg-1'] });
    client.setQueryData(PERF_KEY, { id: 'perf-1' });

    let calls = 0;
    const observer = new QueryObserver(client, {
      queryKey: PERF_KEY,
      queryFn: async () => {
        calls += 1;
        return { id: 'perf-1' };
      },
    });
    const unsubscribe = observer.subscribe(() => {});
    await new Promise((resolve) => setTimeout(resolve, 20));
    unsubscribe();
    return calls;
  }

  it('la confirmation monte sans requête réseau supplémentaire', async () => {
    expect(await mountAfterSubmit(createQueryClient())).toBe(0);
  });

  it('le préchauffage survit à l’invalidation qui le précède (drapeau levé, donnée à l’heure)', () => {
    const client = createQueryClient();
    client.setQueryData(PERF_KEY, { id: 'ancien' });
    void client.invalidateQueries({ queryKey: ['assignment', 'asg-1'] });
    expect(client.getQueryCache().find({ queryKey: PERF_KEY })?.state.isInvalidated).toBe(true);

    client.setQueryData(PERF_KEY, { id: 'perf-1' });

    expect(client.getQueryCache().find({ queryKey: PERF_KEY })?.state.isInvalidated).toBe(false);
    expect(client.getQueryData(PERF_KEY)).toEqual({ id: 'perf-1' });
  });

  it('la promesse tient grâce à `staleTime` : à 0, la requête repart', async () => {
    // Explicite le seul réglage dont dépend le commentaire d'`onSuccess`. C'est aussi
    // l'explication de l'échec de test rencontré pendant le lot 2 : les clients de test sont
    // construits à la main, sans `staleTime`, donc tout y est périmé d'emblée.
    const client = createQueryClient();
    client.setQueryDefaults(['assignment'], { staleTime: 0 });
    expect(await mountAfterSubmit(client)).toBe(1);
  });
});
