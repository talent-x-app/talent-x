import { Injectable, Logger } from '@nestjs/common';
import type { NotificationType } from './jobs.constants';

/** Message push composé par le worker — générique par construction (ADR-10). */
export interface PushMessage {
  title: string;
  body: string;
  /** Données techniques pour la navigation côté client (type + ressource). */
  data: { type: NotificationType; resourceId: string };
}

/** Cible d'envoi : un token et sa plateforme. */
export interface PushTarget {
  token: string;
  platform: string;
}

/** Résultat d'un envoi : tokens signalés invalides par la plateforme (à révoquer). */
export interface PushResult {
  invalidTokens: string[];
}

/**
 * Frontière unique vers APNs/FCM (ADR-22 §4). Les adaptateurs réels seront branchés
 * par configuration quand les credentials existeront ; le pipeline (file, gardes,
 * composition) ne dépend que de cette interface.
 */
export abstract class PushProvider {
  abstract send(targets: PushTarget[], message: PushMessage): Promise<PushResult>;
}

/**
 * Implémentation dev/CI : journalise l'envoi, aucun réseau. Permet de valider le
 * pipeline complet (enqueue → garde → composition → « envoi ») sans credentials.
 */
@Injectable()
export class LoggingPushProvider extends PushProvider {
  private readonly logger = new Logger(LoggingPushProvider.name);

  send(targets: PushTarget[], message: PushMessage): Promise<PushResult> {
    for (const target of targets) {
      this.logger.log(
        `PUSH [${target.platform}] ${target.token.slice(0, 12)}… — ${message.title} ` +
          `(type=${message.data.type} resource=${message.data.resourceId})`,
      );
    }
    return Promise.resolve({ invalidTokens: [] });
  }
}
