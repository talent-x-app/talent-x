import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import type { NotificationType } from '@talent-x/api-client';
import { useSession } from '../auth/SessionProvider';
import { NOTIFICATIONS_QUERY_KEY } from './NotificationsScreen';
import { notificationHref, notificationQueryKeys } from './notification-ui';
import {
  configureForegroundPresentation,
  ensureDeviceRegistered,
  loadNotificationsModule,
  nativePushBridge,
  type NotificationsModule,
  type PushBridge,
  type RegistrationOutcome,
} from './push-registration';

/**
 * Composant racine **sans rendu** (TLX-226) — même patron qu'`OfflineSync` (TLX-077).
 *
 * Trois responsabilités, toutes best-effort :
 *  1. enregistrer le jeton de l'appareil **une fois connecté** (l'endpoint est authentifié) ;
 *  2. router l'utilisateur vers la ressource quand il **tape** une notification système ;
 *  3. rafraîchir à l'**arrivée** d'un push le feed in-app (TLX-231) **et la ressource
 *     annoncée** (TLX-235) — sans quoi l'app annonce un événement qu'elle n'affiche pas.
 *
 * Le module natif est chargé paresseusement : sur un dev client antérieur à cette dépendance,
 * ou sur web, ce composant ne fait rien et l'app démarre normalement (cf. `push-registration`).
 */
export function PushRegistration({
  bridge = nativePushBridge,
  os = Platform.OS,
  loadNotifications = loadNotificationsModule,
}: {
  /** Injectable pour les tests — en production, le pont natif `expo-notifications`. */
  bridge?: PushBridge;
  os?: string;
  /** Chargeur du module natif — injecté en test (l'import dynamique n'y résout pas le mock). */
  loadNotifications?: () => Promise<NotificationsModule | null>;
} = {}) {
  const { role } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  /** Une seule tentative par session connectée : pas de boucle si l'API refuse. */
  const attemptedFor = useRef<string | null>(null);
  /** Le rôle courant, lu par le listener sans le faire dépendre du rôle (évite un réabonnement). */
  const roleRef = useRef(role);
  roleRef.current = role;

  useEffect(() => {
    if (!role) {
      attemptedFor.current = null;
      return;
    }
    if (attemptedFor.current === role) return;
    attemptedFor.current = role;

    void (async () => {
      const outcome: RegistrationOutcome = await ensureDeviceRegistered({ bridge, os });
      // Aucun toast : un refus de permission ou un dev client sans le module natif sont des
      // situations normales, pas des erreurs à afficher. Le diagnostic passe par le retour.
      if (outcome === 'failed') {
        attemptedFor.current = null; // réseau : on retentera au prochain montage
      }
    })();
  }, [role, bridge, os]);

  // Tap sur une notification système → écran de la ressource (mapping partagé avec le centre
  // in-app, ADR-23 : le backend n'envoie qu'un signal `type` + `resourceId`).
  useEffect(() => {
    const subscriptions: { remove: () => void }[] = [];
    let cancelled = false;

    void (async () => {
      // `null` = module natif absent (dev client périmé) ou web : rien à écouter.
      const Notifications = await loadNotifications();
      if (!Notifications || cancelled) return;
      // À défaut, un push reçu app ouverte ne s'affiche pas du tout (cf. `FOREGROUND_BEHAVIOR`).
      configureForegroundPresentation(Notifications);

      // ARRIVÉE d'un push (TLX-231) — distinct du tap ci-dessous. Sans cet abonnement, la
      // notification est en base et la bannière s'affiche, mais rien n'invalide le cache : la
      // cloche et le centre partagent `NOTIFICATIONS_QUERY_KEY` (ADR-23) et restent figés
      // jusqu'au prochain remontage. Attention au faux ami : `staleTime` ne déclenche aucun
      // refetch, il ne fait que marquer la donnée périmée.
      subscriptions.push(
        Notifications.addNotificationReceivedListener((notification) => {
          // Pas de garde sur le rôle : sans observateur monté, l'invalidation se borne à
          // marquer la clé périmée — aucune requête réseau émise.
          void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });

          // …et la RESSOURCE annoncée (TLX-235). Sans ça, l'app annonçait un événement
          // qu'elle n'affichait pas : le badge s'incrémentait, la séance n'apparaissait pas
          // dans la liste en dessous. Le payload porte déjà `type` et `resourceId` — le
          // listener de tap ci-dessous les lit pour router, aucun changement de contrat.
          const data = notification.request.content.data as {
            type?: string;
            resourceId?: string;
          };
          if (!data?.type || !data.resourceId) return;
          for (const queryKey of notificationQueryKeys(
            data.type as NotificationType,
            data.resourceId,
          )) {
            void queryClient.invalidateQueries({ queryKey });
          }
        }),
      );

      subscriptions.push(
        Notifications.addNotificationResponseReceivedListener((response) => {
          const currentRole = roleRef.current;
          if (!currentRole) return;
          const data = response.notification.request.content.data as {
            type?: string;
            resourceId?: string;
          };
          if (!data?.type || !data.resourceId) return;
          const href = notificationHref(
            currentRole,
            data.type as NotificationType,
            data.resourceId,
          );
          if (href) router.push(href as never);
        }),
      );
    })();

    return () => {
      cancelled = true;
      for (const subscription of subscriptions) subscription.remove();
    };
  }, [router, loadNotifications, queryClient]);

  return null;
}
