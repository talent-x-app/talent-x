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
  'sessionAssigned' | 'performanceFeedback' | 'performanceSubmitted' | 'groupUpdates'
> = {
  session_assigned: 'sessionAssigned',
  performance_feedback: 'performanceFeedback',
  performance_submitted: 'performanceSubmitted',
  group_update: 'groupUpdates',
  // ADR-46 : annonces gardées par la même préférence « mises à jour du groupe ».
  group_announcement: 'groupUpdates',
  // ADR-48/49 : kudos de participation, même préférence « mises à jour du groupe ».
  group_kudos: 'groupUpdates',
  // ADR-48/50 : réponse sous une annonce, même préférence « mises à jour du groupe ».
  group_reply: 'groupUpdates',
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
  performance_submitted: {
    title: 'Performance à revoir',
    body: 'Un athlète a soumis une performance.',
  },
  group_update: {
    title: 'Groupe mis à jour',
    body: 'Un athlète a rejoint votre groupe.',
  },
  group_announcement: {
    title: 'Nouvelle annonce',
    body: 'Ton coach a publié une annonce.',
  },
  group_kudos: {
    title: 'Un coéquipier t’encourage',
    body: 'Quelqu’un de ton groupe t’a envoyé des encouragements 👏.',
  },
  group_reply: {
    title: 'Nouvelle réponse',
    body: 'Quelqu’un a répondu à ton annonce.',
  },
};

/**
 * Consommateur de la file `notifications` (worker — ADR-22 §3, ADR-23). Pour chaque
 * job : garde de préférence du destinataire (absence de ligne = défauts : tout actif
 * sauf marketing), **persistance de l'entrée in-app** (upsert sur `dedupe_key` —
 * le rejeu d'un job ne crée pas de doublon), puis tentative push : device tokens
 * actifs, composition générique, envoi via le provider. Les tokens signalés
 * invalides sont révoqués.
 */
@Injectable()
export class NotificationProcessor {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pushProvider: PushProvider,
  ) {}

  async process(payload: NotificationJobPayload): Promise<void> {
    const { type, recipientUserId, resourceId, actorId, dedupeKey } = payload;

    const preferences = await this.prisma.notificationPreferences.findUnique({
      where: { userId: recipientUserId },
    });
    // Absence de ligne = défauts (les trois gardes MVP sont à true en base).
    // Préférence off = silence total : ni push, ni entrée in-app (ADR-23).
    if (preferences && !preferences[PREFERENCE_GATE[type]]) {
      this.logger.log(
        `Notification ignorée (préférence off) : type=${type} dest=${recipientUserId}`,
      );
      return;
    }

    // Feed in-app (ADR-23) — un job rejoué retombe sur la même ligne. `actorId` (ADR-55) est
    // persisté pour la résolution nominative au read ; le push (plus bas) reste générique.
    await this.prisma.notification.upsert({
      where: { dedupeKey },
      create: { userId: recipientUserId, type, resourceId, actorId: actorId ?? null, dedupeKey },
      update: {},
    });

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
