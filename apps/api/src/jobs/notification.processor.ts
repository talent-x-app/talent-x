import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { NotificationJobPayload, NotificationType } from './jobs.constants';
import { PushProvider, type PushMessage } from './push-provider';

/**
 * Préférence qui garde chaque type d'événement (ADR-22 §2) — colonne du même nom
 * dans `notification_preferences`.
 */
const PREFERENCE_GATE: Record<
  NotificationType,
  'sessionAssigned' | 'performanceFeedback' | 'groupUpdates'
> = {
  session_assigned: 'sessionAssigned',
  performance_feedback: 'performanceFeedback',
  group_update: 'groupUpdates',
};

/**
 * Contenu générique par type — un signal, jamais de donnée métier (ADR-10).
 * Le client ouvre la ressource via `data.resourceId`.
 */
const MESSAGES: Record<NotificationType, { title: string; body: string }> = {
  session_assigned: {
    title: 'Nouvelle séance',
    body: 'Une séance t’a été affectée.',
  },
  performance_feedback: {
    title: 'Nouveau feedback',
    body: 'Ton coach a commenté une performance.',
  },
  group_update: {
    title: 'Groupe mis à jour',
    body: 'Un athlète a rejoint votre groupe.',
  },
};

/**
 * Consommateur de la file `notifications` (worker — ADR-22 §3). Pour chaque job :
 * garde de préférence du destinataire (absence de ligne = défauts : tout actif sauf
 * marketing), chargement des device tokens actifs, composition générique, envoi via
 * le provider. Les tokens signalés invalides sont révoqués. Idempotent : rejouer un
 * job ré-envoie au pire un push identique (aucun état muté hors révocation).
 */
@Injectable()
export class NotificationProcessor {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pushProvider: PushProvider,
  ) {}

  async process(payload: NotificationJobPayload): Promise<void> {
    const { type, recipientUserId, resourceId } = payload;

    const preferences = await this.prisma.notificationPreferences.findUnique({
      where: { userId: recipientUserId },
    });
    // Absence de ligne = défauts (les trois gardes MVP sont à true en base).
    if (preferences && !preferences[PREFERENCE_GATE[type]]) {
      this.logger.log(
        `Notification ignorée (préférence off) : type=${type} dest=${recipientUserId}`,
      );
      return;
    }

    const devices = await this.prisma.deviceToken.findMany({
      where: { userId: recipientUserId, revokedAt: null },
      select: { token: true, platform: true },
    });
    if (devices.length === 0) {
      this.logger.log(`Notification sans cible (aucun device actif) : dest=${recipientUserId}`);
      return;
    }

    const message: PushMessage = { ...MESSAGES[type], data: { type, resourceId } };
    const { invalidTokens } = await this.pushProvider.send(devices, message);

    if (invalidTokens.length > 0) {
      await this.prisma.deviceToken.updateMany({
        where: { token: { in: invalidTokens } },
        data: { revokedAt: new Date() },
      });
      this.logger.warn(`${invalidTokens.length} token(s) invalide(s) révoqué(s).`);
    }
  }
}
