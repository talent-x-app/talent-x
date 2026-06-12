import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailProvider, type EmailMessage } from './email-provider';
import type { EmailJobPayload } from './jobs.constants';

/**
 * Traite un job d'email transactionnel (consommé par le `Worker` dans `worker.ts`).
 * Compose le message à partir du `kind` + `params` puis délègue l'envoi au
 * `EmailProvider`. Le rendu (et donc le jeton en clair) ne vit qu'ici, le temps
 * de l'envoi — jamais persisté.
 */
@Injectable()
export class EmailProcessor {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(
    private readonly provider: EmailProvider,
    private readonly config: ConfigService,
  ) {}

  async process(payload: EmailJobPayload): Promise<void> {
    const message = this.compose(payload);
    await this.provider.send(message);
    this.logger.log(`Email envoyé : kind=${payload.kind} to=${payload.to}`);
  }

  /** Compose le message selon le type d'email. */
  private compose(payload: EmailJobPayload): EmailMessage {
    switch (payload.kind) {
      case 'password_reset':
        return this.passwordResetMessage(payload.to, payload.params.token ?? '');
      default: {
        // Exhaustivité : un nouveau kind non géré est une erreur de programmation.
        const exhaustive: never = payload.kind;
        throw new Error(`Type d'email non géré : ${String(exhaustive)}`);
      }
    }
  }

  private passwordResetMessage(to: string, token: string): EmailMessage {
    const base = this.config.get<string>('APP_PUBLIC_URL') ?? 'http://localhost:8081';
    const link = `${base.replace(/\/+$/, '')}/reset-password?token=${encodeURIComponent(token)}`;
    return {
      to,
      subject: 'Réinitialisation de votre mot de passe Talent-X',
      text:
        `Vous avez demandé à réinitialiser votre mot de passe.\n\n` +
        `Ouvrez ce lien pour choisir un nouveau mot de passe :\n${link}\n\n` +
        `Ce lien est à usage unique et expire prochainement. ` +
        `Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.`,
    };
  }
}
