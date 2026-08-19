import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { NOTIFICATIONS_QUERY_KEY } from './NotificationsScreen';

/**
 * Composant racine **sans rendu** : recharge le feed de notifications au **retour au
 * premier plan** (TLX-237).
 *
 * Pourquoi il faut ça. Un push reçu **app en arrière-plan** est affiché par le système à
 * partir du payload FCM : `addNotificationReceivedListener` ne se déclenche pas, donc rien
 * n'invalide le cache. Et rien ne rattrapait ensuite —
 *  - `refetchOnWindowFocus: false` est posé volontairement dans `query-client.ts`, et en
 *    React Native il n'aurait de toute façon aucun effet sans câblage `AppState` ;
 *  - `notifications` est un `Tabs.Screen … href: null` : l'écran n'est **jamais démonté**,
 *    donc `refetchOnMount` ne se rejoue jamais non plus ;
 *  - `staleTime` ne déclenche aucun refetch, il marque seulement la donnée périmée.
 *
 * Résultat mesuré sur appareil : l'entrée n'apparaissait qu'au push **suivant** reçu au
 * premier plan, qui rechargeait la liste entière — les deux d'un coup.
 *
 * **Portée volontairement limitée à la clé des notifications.** Basculer
 * `refetchOnWindowFocus` à `true` globalement changerait le comportement réseau de toutes
 * les requêtes de l'app, sur mobile et potentiellement hors WiFi : c'est un arbitrage
 * produit qui demande un ADR, pas un effet de bord de ce correctif. Ici, une seule requête
 * légère par retour au premier plan, sur l'écran qui doit faire foi (ADR-23).
 */
export function NotificationsForegroundRefresh() {
  const queryClient = useQueryClient();
  // Comparaison par égalité plutôt que par expression régulière : `AppState.currentState`
  // n'est pas garanti d'être une chaîne (il ne l'est pas sous jest-expo), et une sonde qui
  // lève dans son propre écouteur ne rattraperait plus rien.
  const previousState = useRef<AppStateStatus | null>(AppState.currentState ?? null);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      const wasInBackground =
        previousState.current === 'background' || previousState.current === 'inactive';
      previousState.current = next;
      // Uniquement la TRANSITION arrière-plan → actif : `change` émet aussi `inactive`
      // (bannière système, centre de contrôle) où il n'y a rien à recharger.
      if (wasInBackground && next === 'active') {
        void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
      }
    });
    return () => subscription.remove();
  }, [queryClient]);

  return null;
}
