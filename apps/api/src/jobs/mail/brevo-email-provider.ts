/**
 * Adaptateur email transactionnel réel derrière `EmailProvider` (TLX-128).
 *
 * Envoie via l'API HTTP v3 de **Brevo** (`POST /v3/smtp/email`), authentifiée par
 * une clé d'API (`api-key`). Sous-traitant **UE** (société française) — pas de
 * transfert hors UE (cf. `email-config.ts`). `fetch` est injecté (même schéma que
 * `FcmClient`) → réseau mockable, aucune nouvelle dépendance.
 *
 * Gestion des échecs : un envoi non abouti (réponse non 2xx, ou panne réseau)
 * **lève** — contrairement au push (lot multi-destinataires tolérant), un email
 * vise un seul destinataire et BullMQ est configuré pour retenter (`attempts: 3`,
 * backoff exponentiel — `EmailQueueService`). Lever propage l'échec au worker qui
 * relance le job ; un succès consomme le job.
 */
import { Logger } from '@nestjs/common';
import type { EmailMessage, EmailProvider } from '../email-provider';
import type { EmailConfig } from './email-config';

/** Sous-ensemble de `fetch` utilisé — injectable pour mocker le réseau en test. */
export type FetchLike = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
  },
) => Promise<{
  status: number;
  ok: boolean;
  text: () => Promise<string>;
}>;

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

export class BrevoEmailProvider implements EmailProvider {
  private readonly logger = new Logger(BrevoEmailProvider.name);

  constructor(
    private readonly config: EmailConfig,
    private readonly fetchFn: FetchLike,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const body = JSON.stringify({
      sender: { email: this.config.fromAddress, name: this.config.fromName },
      to: [{ email: message.to }],
      subject: message.subject,
      textContent: message.text,
    });

    let res: Awaited<ReturnType<FetchLike>>;
    try {
      res = await this.fetchFn(BREVO_ENDPOINT, {
        method: 'POST',
        headers: {
          'api-key': this.config.apiKey,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body,
      });
    } catch (err) {
      // Panne réseau : échec transitoire → lever pour que BullMQ retente.
      throw new Error(`Brevo injoignable : ${(err as Error).message}`, { cause: err });
    }

    if (!res.ok) {
      // L'API renvoie un corps JSON `{ code, message }` ; on le logue tronqué
      // sans le propager (peut contenir l'adresse destinataire).
      const detail = await this.safeBody(res);
      this.logger.warn(`Brevo a répondu ${res.status}${detail ? ` (${detail})` : ''}.`);
      throw new Error(`Brevo a répondu ${res.status}`);
    }
  }

  /** Lit le corps d'erreur de façon tolérante (tronqué), jamais bloquant. */
  private async safeBody(res: { text: () => Promise<string> }): Promise<string> {
    try {
      return (await res.text()).slice(0, 200);
    } catch {
      return '';
    }
  }
}
