import { Injectable, Logger } from '@nestjs/common';

/** Message email composé par le worker (sujet + corps texte). */
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

/**
 * Frontière unique vers le fournisseur SMTP/email (TX-SEC-003 §10/§17). L'adaptateur
 * réel (SMTP UE / API transactionnelle) sera branché par configuration quand les
 * credentials existeront ; le pipeline (file, composition, anti-énumération) ne
 * dépend que de cette interface — même schéma que `PushProvider` (ADR-22 §4).
 */
export abstract class EmailProvider {
  abstract send(message: EmailMessage): Promise<void>;
}

/**
 * Implémentation dev/CI : journalise l'envoi, aucun réseau. Permet de valider le
 * pipeline complet (enqueue → composition → « envoi ») et de lire le lien de
 * réinitialisation en dev sans dépendre d'un fournisseur email.
 */
@Injectable()
export class LoggingEmailProvider extends EmailProvider {
  private readonly logger = new Logger(LoggingEmailProvider.name);

  send(message: EmailMessage): Promise<void> {
    this.logger.log(`EMAIL → ${message.to} — « ${message.subject} »\n${message.text}`);
    return Promise.resolve();
  }
}
