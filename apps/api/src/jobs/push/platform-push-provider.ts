/**
 * `PushProvider` réel routant chaque cible vers l'adaptateur de sa plateforme
 * (TLX-107, ADR-22 §4). Un seul envoi peut mêler des tokens `apns` et `fcm` (le
 * destinataire a plusieurs appareils) : on **partitionne par plateforme**, on
 * délègue à l'adaptateur correspondant, et on agrège les `invalidTokens`.
 *
 * Un adaptateur absent (plateforme non configurée) → ses cibles sont ignorées,
 * jamais invalidées (l'absence de credentials est transitoire, pas un token mort).
 */
import { Logger } from '@nestjs/common';
import type { ApnsClient } from './apns-client';
import type { FcmClient } from './fcm-client';
import { PushProvider, type PushMessage, type PushResult, type PushTarget } from '../push-provider';

export class PlatformPushProvider extends PushProvider {
  private readonly logger = new Logger(PlatformPushProvider.name);

  constructor(
    private readonly apns: ApnsClient | null,
    private readonly fcm: FcmClient | null,
  ) {
    super();
  }

  async send(targets: PushTarget[], message: PushMessage): Promise<PushResult> {
    const apnsTargets = targets.filter((t) => t.platform === 'apns');
    const fcmTargets = targets.filter((t) => t.platform === 'fcm');

    const unconfigured = [
      this.apns ? null : apnsTargets.length,
      this.fcm ? null : fcmTargets.length,
    ].filter((n): n is number => n !== null && n > 0);
    if (unconfigured.length > 0) {
      this.logger.warn(
        `Cibles ignorées faute d'adaptateur configuré : ${unconfigured.reduce((a, b) => a + b, 0)}.`,
      );
    }

    const results = await Promise.all([
      this.apns && apnsTargets.length > 0
        ? this.apns.send(apnsTargets, message)
        : Promise.resolve<PushResult>({ invalidTokens: [] }),
      this.fcm && fcmTargets.length > 0
        ? this.fcm.send(fcmTargets, message)
        : Promise.resolve<PushResult>({ invalidTokens: [] }),
    ]);

    return { invalidTokens: results.flatMap((r) => r.invalidTokens) };
  }
}
