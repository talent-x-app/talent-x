import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

/**
 * Tirer-pour-rafraîchir d'un écran de **détail** (TLX-269).
 *
 * Les onze écrans de liste posent un `RefreshControl` sur `query.refetch()` : une liste n'a
 * qu'une requête. Un écran de détail en a plusieurs, dont celles qui portent le contenu produit
 * par autrui — fil de discussion, feedback du coach, kudos des coéquipiers, présence des autres.
 * Rafraîchir une seule d'entre elles laisserait figé précisément ce que l'utilisateur cherche.
 *
 * D'où l'invalidation par **préfixes**, comme `notificationQueryKeys` le fait à l'arrivée d'un
 * push : `['assignment', id]` emporte performance, présence, agrégat et kudos ; `['performance']`
 * emporte les fils de commentaires, qui vivent sous l'identifiant de la **performance** et non
 * sous celui de l'affectation.
 *
 * **Indépendant de `staleTime`** — c'est le cœur du ticket. Le contournement connu (sortir de
 * l'écran et y revenir, qui remonte l'écran via la `key` d'ADR-58) ne déclenche `refetchOnMount`
 * qu'au-delà des 30 s de `staleTime` : en deçà, la donnée passe pour fraîche et l'aller-retour ne
 * ramène rien. Un athlète qui vérifie deux fois de suite si son coach a répondu en concluait
 * qu'il n'avait pas répondu (QA-04.7). `invalidateQueries` refetch les observateurs **montés**
 * sans consulter `staleTime`.
 *
 * L'état `refreshing` couvre l'ensemble des requêtes et non la première : le rendu de la
 * poignée doit durer aussi longtemps que le rafraîchissement qu'elle annonce.
 */
export function usePullToRefresh(keys: readonly (readonly unknown[])[]): {
  refreshing: boolean;
  onRefresh: () => void;
} {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  // `keys` est reconstruit à chaque rendu par les appelants (littéral de tableau) : on le
  // sérialise pour que l'identité du callback suive le *contenu* des clés, pas la référence.
  const serialised = JSON.stringify(keys);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    const queryKeys = JSON.parse(serialised) as readonly unknown[][];
    void Promise.all(
      queryKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    ).finally(() => setRefreshing(false));
  }, [queryClient, serialised]);

  return { refreshing, onRefresh };
}
