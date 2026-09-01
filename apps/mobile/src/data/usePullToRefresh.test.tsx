import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { type ReactNode } from 'react';
import { Pressable, Text } from 'react-native';
import { usePullToRefresh } from './usePullToRefresh';

/**
 * TLX-269 — tirer-pour-rafraîchir des écrans de détail.
 *
 * Le défaut : `RefreshControl` était posé sur **onze écrans de liste et zéro écran de détail**,
 * alors que le détail est précisément l'endroit où arrive le contenu produit par autrui — fil de
 * discussion, feedback du coach, kudos, présence des autres. Le geste enseigné partout dans
 * l'app était absent là où il sert.
 *
 * Le contournement — sortir de l'écran et revenir — ne marche qu'au-delà de 30 s (`staleTime`).
 * C'est le piège de QA-04.7 : la première tentative de l'utilisateur n'a rien montré. D'où le
 * test central ci-dessous, sur un client à `staleTime` **non nul**, comme le vrai.
 */

/** Client de test au `staleTime` du vrai `createQueryClient` — c'est tout l'enjeu. */
function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, retry: false } },
  });
}

function Wrapper({ client, children }: { client: QueryClient; children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Écran de détail miniature : deux requêtes de préfixes différents + une poignée. */
function DetailHarness({ fetchA, fetchB }: { fetchA: () => Promise<string>; fetchB: () => void }) {
  const a = useQuery({ queryKey: ['assignment', 'asg-1'], queryFn: fetchA });
  useQuery({
    queryKey: ['performance', 'p-1', 'comments'],
    queryFn: async () => {
      fetchB();
      return 'fil';
    },
  });
  const refresh = usePullToRefresh([['assignment', 'asg-1'], ['performance']]);

  return (
    <>
      <Text testID="value">{a.data ?? '—'}</Text>
      <Text testID="refreshing">{String(refresh.refreshing)}</Text>
      <Pressable testID="pull" onPress={refresh.onRefresh}>
        <Text>tirer</Text>
      </Pressable>
    </>
  );
}

describe('usePullToRefresh (TLX-269)', () => {
  it('recharge malgré un staleTime non écoulé — c’est ce que l’aller-retour ne savait pas faire', async () => {
    const client = makeClient();
    let served = 'réponse du coach absente';
    const fetchA = jest.fn(async () => served);
    render(
      <Wrapper client={client}>
        <DetailHarness fetchA={fetchA} fetchB={jest.fn()} />
      </Wrapper>,
    );
    await waitFor(() => expect(screen.getByTestId('value')).toHaveTextContent(/absente/));
    expect(fetchA).toHaveBeenCalledTimes(1);

    // Le coach répond entre-temps. La donnée en cache a moins de 30 s : pour TanStack elle est
    // « fraîche », donc un remontage (le contournement d'ADR-58) ne la rechargerait pas.
    served = 'réponse du coach arrivée';

    act(() => fireEvent.press(screen.getByTestId('pull')));

    await waitFor(() => expect(screen.getByTestId('value')).toHaveTextContent(/arrivée/));
    expect(fetchA).toHaveBeenCalledTimes(2);
  });

  it('recharge **toutes** les clés données, pas seulement la première', async () => {
    // Le fil de discussion vit sous `['performance', <perfId>, 'comments']`, pas sous
    // l'affectation : rafraîchir la seule affectation laisserait figé ce que l'athlète attend.
    const client = makeClient();
    const fetchB = jest.fn();
    render(
      <Wrapper client={client}>
        <DetailHarness fetchA={jest.fn(async () => 'v')} fetchB={fetchB} />
      </Wrapper>,
    );
    await waitFor(() => expect(fetchB).toHaveBeenCalledTimes(1));

    act(() => fireEvent.press(screen.getByTestId('pull')));

    await waitFor(() => expect(fetchB).toHaveBeenCalledTimes(2));
  });

  it('`refreshing` couvre le rafraîchissement puis retombe', async () => {
    const client = makeClient();
    let release: (v: string) => void = () => {};
    const fetchA = jest
      .fn()
      .mockResolvedValueOnce('initial')
      .mockImplementationOnce(() => new Promise<string>((r) => (release = r)));
    render(
      <Wrapper client={client}>
        <DetailHarness fetchA={fetchA} fetchB={jest.fn()} />
      </Wrapper>,
    );
    await waitFor(() => expect(screen.getByTestId('value')).toHaveTextContent('initial'));
    expect(screen.getByTestId('refreshing')).toHaveTextContent('false');

    act(() => fireEvent.press(screen.getByTestId('pull')));
    await waitFor(() => expect(screen.getByTestId('refreshing')).toHaveTextContent('true'));

    // La poignée doit durer aussi longtemps que le rafraîchissement qu'elle annonce : elle ne
    // retombe qu'une fois la requête réellement résolue, pas au retour de `onRefresh`.
    await act(async () => {
      release('rechargé');
    });
    await waitFor(() => expect(screen.getByTestId('refreshing')).toHaveTextContent('false'));
  });
});
