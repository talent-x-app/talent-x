/**
 * Configuration de l'adaptateur email transactionnel réel (TLX-128).
 *
 * Le pipeline email (file BullMQ `transactional-email` → `EmailProcessor` →
 * `EmailProvider`, TLX-104) ne dépend que de l'interface `EmailProvider`. Tant
 * qu'aucun credential n'est configuré, le worker retombe sur `LoggingEmailProvider`
 * (dev/CI, aucun réseau) — exactement comme `LoggingPushProvider` côté push.
 *
 * Fournisseur retenu : **Brevo** (ex-Sendinblue, société française — données
 * hébergées en UE). C'est donc un **sous-traitant UE** (art. 28, registre
 * TX-SEC-003 §10/§17) : pas de transfert hors UE à documenter, contrairement à
 * APNs/FCM. L'API HTTP v3 est appelée via `fetch` injectable (même schéma que
 * `FcmClient`) — aucune nouvelle dépendance, réseau mockable en test.
 *
 * Les credentials viennent de l'environnement — jamais en dur (TX-SEC-003 §12).
 * Le groupe est **tout-ou-rien** : une configuration partielle est une erreur
 * (fail-fast à la validation d'env), pas un envoi silencieusement cassé.
 */

/** Credentials résolus de l'adaptateur Brevo. */
export interface EmailConfig {
  /** Clé d'API Brevo (en-tête `api-key`). */
  apiKey: string;
  /** Adresse de l'expéditeur (doit être un expéditeur vérifié côté Brevo). */
  fromAddress: string;
  /** Nom affiché de l'expéditeur. Défaut `Talent-X`. */
  fromName: string;
}

/** Lecteur de variables d'environnement (injectable pour les tests). */
export type EnvGetter = (key: string) => string | undefined;

/** Nom d'expéditeur par défaut si `EMAIL_FROM_NAME` est absent. */
const DEFAULT_FROM_NAME = 'Talent-X';

/**
 * Clés requises (tout-ou-rien). `EMAIL_FROM_NAME` est volontairement exclu : il
 * est optionnel (défaut `Talent-X`) et ne déclenche jamais l'activation à lui seul.
 */
const REQUIRED_KEYS = ['BREVO_API_KEY', 'EMAIL_FROM_ADDRESS'] as const;

/** Sous-ensemble présent (valeur non vide) parmi un groupe de clés. */
function presentKeys(get: EnvGetter, keys: readonly string[]): string[] {
  return keys.filter((k) => (get(k) ?? '').trim().length > 0);
}

/**
 * Valide la complétude tout-ou-rien des credentials email. Renvoie la liste des
 * erreurs (vide si cohérent). Branchée dans `validateEnv` (fail-fast).
 */
export function validateEmailEnv(get: EnvGetter): string[] {
  const present = presentKeys(get, REQUIRED_KEYS);
  if (present.length === 0 || present.length === REQUIRED_KEYS.length) {
    return [];
  }
  const missing = REQUIRED_KEYS.filter((k) => !present.includes(k));
  return [
    `Configuration email (Brevo) incomplète : ${missing.join(', ')} manquant(s) ` +
      `(tout-ou-rien — fournir tous les credentials email ou aucun)`,
  ];
}

/**
 * Résout la configuration email depuis l'environnement. Suppose la complétude
 * déjà validée par `validateEmailEnv` ; un groupe partiel est ici traité comme
 * absent (→ `null`, le worker retombe sur `LoggingEmailProvider`).
 */
export function parseEmailConfig(get: EnvGetter): EmailConfig | null {
  if (presentKeys(get, REQUIRED_KEYS).length !== REQUIRED_KEYS.length) {
    return null;
  }
  const fromName = (get('EMAIL_FROM_NAME') ?? '').trim();
  return {
    apiKey: (get('BREVO_API_KEY') as string).trim(),
    fromAddress: (get('EMAIL_FROM_ADDRESS') as string).trim(),
    fromName: fromName.length > 0 ? fromName : DEFAULT_FROM_NAME,
  };
}
