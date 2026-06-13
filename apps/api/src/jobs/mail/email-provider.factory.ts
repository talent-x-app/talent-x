/**
 * Sélectionne l'implémentation d'`EmailProvider` au démarrage du worker (TLX-128).
 *
 * - Aucun credential email configuré → `LoggingEmailProvider` (dev/CI) : le
 *   pipeline complet (enqueue → composition → « envoi ») reste validable sans
 *   fournisseur, et le lien de reset est lisible dans le log.
 * - Credentials présents → `BrevoEmailProvider` (envoi HTTP réel, sous-traitant UE).
 *
 * Les credentials viennent de l'environnement (jamais en dur) ; leur complétude
 * tout-ou-rien est déjà garantie par `validateEnv` (fail-fast).
 */
import { Logger } from '@nestjs/common';
import { EmailProvider, LoggingEmailProvider } from '../email-provider';
import { BrevoEmailProvider, type FetchLike } from './brevo-email-provider';
import { parseEmailConfig, type EnvGetter } from './email-config';

export function createEmailProvider(get: EnvGetter): EmailProvider {
  const logger = new Logger('EmailProviderFactory');
  const config = parseEmailConfig(get);

  if (!config) {
    logger.log('Aucun credential email — LoggingEmailProvider (email journalisé, pas de réseau).');
    return new LoggingEmailProvider();
  }

  logger.log(`Email réel actif — Brevo (expéditeur ${config.fromAddress}).`);
  return new BrevoEmailProvider(config, realFetch);
}

/** Pont vers le `fetch` global (Node ≥ 18) typé pour `BrevoEmailProvider`. */
const realFetch: FetchLike = (url, init) => fetch(url, init);
