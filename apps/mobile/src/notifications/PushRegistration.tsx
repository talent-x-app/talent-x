import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import type { NotificationType } from '@talent-x/api-client';
import { useSession } from '../auth/SessionProvider';
import { notificationHref } from './notification-ui';
import {
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
 * Deux responsabilités, toutes deux best-effort :
 *  1. enregistrer le jeton de l'appareil **une fois connecté** (l'endpoint est authentifié) ;
 *  2. router l'utilisateur vers la ressource quand il **tape** une notification système.
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
    let subscription: { remove: () => void } | null = null;
    let cancelled = false;

    void (async () => {
      // `null` = module natif absent (dev client périmé) ou web : rien à écouter.
      const Notifications = await loadNotifications();
      if (!Notifications || cancelled) return;
      subscription = Notifications.addNotificationResponseReceivedListener((response) => {
        const currentRole = roleRef.current;
        if (!currentRole) return;
        const data = response.notification.request.content.data as {
          type?: string;
          resourceId?: string;
        };
        if (!data?.type || !data.resourceId) return;
        const href = notificationHref(currentRole, data.type as NotificationType, data.resourceId);
        if (href) router.push(href as never);
      });
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [router, loadNotifications]);

  return null;
}
