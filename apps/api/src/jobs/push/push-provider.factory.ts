/**
 * Sélectionne l'implémentation de `PushProvider` au démarrage du worker (TLX-107).
 *
 * - Aucune plateforme configurée → `LoggingPushProvider` (dev/CI) : le pipeline
 *   complet reste validable sans credentials, exactement comme avant.
 * - Au moins une plateforme configurée → `PlatformPushProvider` avec les adaptateurs
 *   réels disponibles (APNs et/ou FCM). Une plateforme absente voit ses cibles
 *   ignorées (jamais invalidées).
 *
 * Les credentials viennent de l'environnement (jamais en dur) et leur complétude
 * tout-ou-rien est déjà garantie par `validateEnv` (fail-fast).
 */
import { Logger } from '@nestjs/common';
import { LoggingPushProvider, PushProvider } from '../push-provider';
import { ApnsClient } from './apns-client';
import { FcmClient, type FetchLike } from './fcm-client';
import { Http2ApnsTransport } from './http2-apns-transport';
import { PlatformPushProvider } from './platform-push-provider';
import { parsePushConfig, type EnvGetter } from './push-config';

export function createPushProvider(get: EnvGetter): PushProvider {
  const logger = new Logger('PushProviderFactory');
  const { apns, fcm } = parsePushConfig(get);

  if (!apns && !fcm) {
    logger.log('Aucun credential APNs/FCM — LoggingPushProvider (push journalisé, pas de réseau).');
    return new LoggingPushProvider();
  }

  const apnsClient = apns
    ? new ApnsClient(apns, new Http2ApnsTransport(apnsHost(apns.production)))
    : null;
  const fcmClient = fcm ? new FcmClient(fcm, realFetch) : null;

  logger.log(
    `Push réel actif — APNs:${apns ? (apns.production ? 'prod' : 'sandbox') : 'off'} ` +
      `FCM:${fcm ? 'on' : 'off'}.`,
  );
  return new PlatformPushProvider(apnsClient, fcmClient);
}

function apnsHost(production: boolean): string {
  return production ? 'api.push.apple.com' : 'api.sandbox.push.apple.com';
}

/** Pont vers le `fetch` global (Node ≥ 18) typé pour `FcmClient`. */
const realFetch: FetchLike = (url, init) => fetch(url, init);
