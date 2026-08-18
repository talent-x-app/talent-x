import { registerDevice, revokeDevice, type DevicePlatform } from '@talent-x/api-client';
import { deviceStore, type KeyValueStore } from '../offline/key-value-store';

/**
 * Enregistrement du **device token push** (TLX-226) — chaînon client de la chaîne ADR-22.
 *
 * Le backend parle **directement** à APNs et FCM (`apps/api/src/jobs/push/`) : on remonte donc
 * le **jeton natif** de l'appareil (`getDevicePushTokenAsync`), pas un jeton du service Expo —
 * ce dernier ne serait exploitable que par l'infrastructure d'Expo.
 *
 * Tout est **best-effort** : une permission refusée, un jeton indisponible ou un appel raté ne
 * doivent jamais empêcher l'app de fonctionner. Le push est un confort, pas un prérequis.
 *
 * Le module natif est chargé **paresseusement** (cf. `loadNotificationsModule`) : un dev client
 * plus ancien que cette dépendance ne l'embarque pas, et un import statique ferait échouer le
 * chargement du bundle entier — c'est précisément le mode de panne de TLX-141 et TLX-218.
 */

/** Clés de persistance : ce qui a été enregistré, pour ne pas ré-enregistrer ni révoquer à l'aveugle. */
const DEVICE_ID_KEY = 'push.device.id';
const DEVICE_TOKEN_KEY = 'push.device.token';

/** Issue d'une tentative d'enregistrement — sert au diagnostic, jamais à bloquer l'utilisateur. */
export type RegistrationOutcome =
  | 'registered' // nouvel enregistrement accepté par l'API
  | 'unchanged' // le même jeton est déjà enregistré → aucun appel réseau
  | 'denied' // l'utilisateur a refusé les notifications (chemin normal)
  | 'unavailable' // module natif absent (dev client périmé) ou jeton introuvable
  | 'unsupported' // plateforme sans push (web)
  | 'failed'; // l'appel API a échoué (réseau, 4xx/5xx)

/** Accès au monde natif, injecté pour rester testable sans module natif ni appareil. */
export interface PushBridge {
  /** `true` si l'utilisateur autorise les notifications (demande la permission si besoin). */
  ensurePermission(): Promise<boolean>;
  /** Jeton natif de l'appareil (APNs hex / FCM registration token), `null` si indisponible. */
  getDeviceToken(): Promise<string | null>;
}

export interface RegistrationDeps {
  bridge: PushBridge;
  store?: KeyValueStore;
  /** `Platform.OS` — injecté pour tester les trois cas sans manipuler react-native. */
  os: string;
}

/**
 * Plateforme du contrat (`DevicePlatform`) déduite de l'OS. `null` sur web : aucun transport push
 * n'est configuré côté serveur pour un navigateur.
 *
 * Valeurs en **littéraux** et enum en `import type` : importer l'objet `DevicePlatform` au niveau
 * valeur casserait toutes les suites qui moquent `@talent-x/api-client` sans lui (leçon ADR-44).
 */
export function platformForOs(os: string): DevicePlatform | null {
  if (os === 'ios') return 'apns';
  if (os === 'android') return 'fcm';
  return null;
}

/**
 * Enregistre l'appareil si nécessaire. **Idempotent** : si le jeton n'a pas changé depuis le
 * dernier enregistrement réussi, aucun appel n'est émis — l'app se relance sans marteler l'API.
 */
export async function ensureDeviceRegistered({
  bridge,
  store = deviceStore,
  os,
}: RegistrationDeps): Promise<RegistrationOutcome> {
  const platform = platformForOs(os);
  if (!platform) return 'unsupported';

  const granted = await bridge.ensurePermission();
  // Refus = choix de l'utilisateur, pas une panne : on ne réessaie pas, on ne remonte pas d'erreur.
  if (!granted) return 'denied';

  const token = await bridge.getDeviceToken();
  if (!token) return 'unavailable';

  const [knownToken, knownId] = await Promise.all([
    store.getItem(DEVICE_TOKEN_KEY),
    store.getItem(DEVICE_ID_KEY),
  ]);
  if (knownToken === token && knownId) return 'unchanged';

  try {
    const response = await registerDevice({ platform, token });
    if (response.status !== 201) return 'failed';
    await Promise.all([
      store.setItem(DEVICE_ID_KEY, response.data.id),
      store.setItem(DEVICE_TOKEN_KEY, token),
    ]);
    return 'registered';
  } catch {
    // Réseau coupé au démarrage : on retentera au prochain lancement (rien n'est persisté).
    return 'failed';
  }
}

/**
 * Révoque l'appareil enregistré, s'il y en a un. **À appeler avant de purger les jetons d'auth** :
 * l'endpoint est authentifié, une révocation après déconnexion partirait en 401.
 *
 * Ne lève jamais : l'enregistrement local est purgé quoi qu'il arrive, pour ne pas laisser un
 * identifiant d'appareil orphelin dans le trousseau après une déconnexion (minimisation RGPD).
 */
export async function revokeRegisteredDevice(store: KeyValueStore = deviceStore): Promise<void> {
  const id = await store.getItem(DEVICE_ID_KEY);
  if (id) {
    try {
      await revokeDevice(id);
    } catch {
      // Best-effort : le serveur invalidera de toute façon le jeton au premier envoi refusé
      // par le fournisseur (mapping `invalidTokens`, TLX-107).
    }
  }
  await Promise.all([store.removeItem(DEVICE_ID_KEY), store.removeItem(DEVICE_TOKEN_KEY)]);
}

export type NotificationsModule = typeof import('expo-notifications');

/**
 * Charge `expo-notifications` à la demande. `null` si le module natif n'est pas dans le binaire
 * (dev client antérieur à TLX-226) : le push est alors simplement inactif, l'app démarre.
 *
 * Exporté et **injectable** : sous `jest-expo`, un `await import()` ne se résout pas vers le mock
 * du module, ce qui rendrait tout appelant intestable. Les tests passent donc leur propre
 * chargeur ; la production garde l'import dynamique.
 */
export async function loadNotificationsModule(): Promise<NotificationsModule | null> {
  try {
    return await import('expo-notifications');
  } catch {
    return null;
  }
}

/**
 * Comportement d'affichage d'un push reçu **app au premier plan**.
 *
 * Sans handler, `expo-notifications` **avale** silencieusement toute notification arrivant pendant
 * que l'app est ouverte — rien à l'écran — alors que la même notification s'affiche normalement en
 * arrière-plan, où c'est le système qui la présente à partir du bloc `notification` du payload FCM
 * (`apps/api/src/jobs/push/fcm-client.ts`). Écart constaté en validant TLX-84 sur appareil réel.
 *
 * `shouldSetBadge: false` (iOS) : l'app ne tient aucun compteur de badge — l'activer poserait une
 * pastille que rien ne viendrait jamais remettre à zéro.
 */
export const FOREGROUND_BEHAVIOR = {
  shouldShowBanner: true,
  shouldShowList: true,
  shouldPlaySound: true,
  shouldSetBadge: false,
} as const;

/**
 * Installe le comportement d'affichage au premier plan. Appelé une fois le module natif chargé —
 * donc jamais sur web ni sur un dev client qui ne l'embarque pas (cf. `loadNotificationsModule`).
 */
export function configureForegroundPresentation(Notifications: NotificationsModule): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ ...FOREGROUND_BEHAVIOR }),
  });
}

/**
 * Pont réel vers `expo-notifications`, au-dessus d'un **chargeur injecté**.
 *
 * Le chargeur est un paramètre pour la même raison que `loadNotificationsModule` est exporté :
 * sous `jest-expo`, l'`await import()` de ce dernier **lève** au lieu de se résoudre, si bien
 * qu'un pont qui l'appellerait en dur retomberait toujours sur « module absent » — les chemins
 * permission accordée / refus définitif / jeton non textuel seraient intestables.
 */
export function makeNativePushBridge(
  load: () => Promise<NotificationsModule | null> = loadNotificationsModule,
): PushBridge {
  return {
    async ensurePermission(): Promise<boolean> {
      const Notifications = await load();
      if (!Notifications) return false;
      const current = await Notifications.getPermissionsAsync();
      if (current.granted) return true;
      // `canAskAgain === false` → l'utilisateur a refusé définitivement : ne pas insister.
      if (!current.canAskAgain) return false;
      const asked = await Notifications.requestPermissionsAsync();
      return asked.granted;
    },

    async getDeviceToken(): Promise<string | null> {
      const Notifications = await load();
      if (!Notifications) return null;
      try {
        const token = await Notifications.getDevicePushTokenAsync();
        return typeof token.data === 'string' ? token.data : null;
      } catch {
        // Android sans `google-services.json`, simulateur iOS, appareil hors ligne…
        return null;
      }
    },
  };
}

/** Pont de production. Toute absence/erreur se traduit par « pas de push ». */
export const nativePushBridge: PushBridge = makeNativePushBridge();
