import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import { type ReactNode } from 'react';

import { NotificationsForegroundRefresh } from './NotificationsForegroundRefresh';

/**
 * TLX-237 — un push reçu app EN ARRIÈRE-PLAN n'invalide rien (c'est le système qui affiche
 * la bannière), et rien ne rattrapait au retour : `refetchOnWindowFocus: false`, écran
 * jamais démonté donc pas de `refetchOnMount`, et `staleTime` qui ne déclenche aucun
 * refetch. L'entrée n'apparaissait qu'au push suivant reçu au premier plan.
 */
describe('NotificationsForegroundRefresh (TLX-237)', () => {
  /** Capture le handler passé à `AppState.addEventListener` pour rejouer les transitions. */
  function mountWithAppState() {
    let handler: ((state: AppStateStatus) => void) | undefined;
    const remove = jest.fn();
    const addEventListener = jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((event, listener) => {
        if (event === 'change') handler = listener as (state: AppStateStatus) => void;
        return { remove } as ReturnType<typeof AppState.addEventListener>;
      });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const Wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const view = render(<NotificationsForegroundRefresh />, { wrapper: Wrapper });

    return {
      view,
      invalidate,
      remove,
      addEventListener,
      change: (state: AppStateStatus) => handler?.(state),
    };
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('retour au premier plan : recharge le feed des notifications', () => {
    const { change, invalidate } = mountWithAppState();

    change('background');
    expect(invalidate).not.toHaveBeenCalled();

    change('active');

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['notifications', 'me'] });
  });

  it('ne recharge QUE la clé des notifications (pas de bascule globale du refetch au focus)', () => {
    const { change, invalidate } = mountWithAppState();

    change('background');
    change('active');

    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it('passage par `inactive` sans arrière-plan réel : aucun rechargement inutile', () => {
    const { change, invalidate } = mountWithAppState();

    // `inactive` seul (bannière système, centre de contrôle iOS) puis retour : rien n'a
    // pu arriver entre-temps qui justifie une requête.
    change('inactive');
    change('inactive');

    expect(invalidate).not.toHaveBeenCalled();
  });

  it('se désabonne au démontage', () => {
    const { view, remove } = mountWithAppState();

    view.unmount();

    expect(remove).toHaveBeenCalled();
  });
});
