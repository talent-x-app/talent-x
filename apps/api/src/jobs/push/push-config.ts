/**
 * Configuration des adaptateurs push réels (TLX-107, ADR-22 §4).
 *
 * Les credentials APNs (Apple) et FCM (Google) viennent de l'environnement —
 * jamais en dur (TX-SEC-003 §12). Chaque plateforme est **tout-ou-rien** : une
 * configuration partielle est une erreur (fail-fast à la validation d'env), pas
 * un envoi silencieusement cassé. Si aucune plateforme n'est configurée, le worker
 * retombe sur `LoggingPushProvider` (dev/CI) — voir `push-provider.factory`.
 *
 * Transfert hors UE (TX-SEC-003 §10/§17) : APNs/FCM sont des sous-traitants hors UE.
 * Le contenu poussé reste **minimal** (signal + `resourceId`, ADR-10) — aucune
 * donnée de santé ni marque ne transite par ces fournisseurs.
 */

/** Credentials APNs (auth par jeton ES256, .p8 — recommandé par Apple). */
export interface ApnsConfig {
  /** Identifiant de la clé de signature (.p8) — en-tête `kid` du JWT provider. */
  keyId: string;
  /** Identifiant d'équipe Apple Developer — claim `iss` du JWT provider. */
  teamId: string;
  /** Bundle ID de l'app — en-tête `apns-topic`. */
  bundleId: string;
  /** Clé privée ES256 au format PEM (PKCS#8). */
  privateKey: string;
  /** true → `api.push.apple.com` (prod) ; false → `api.sandbox.push.apple.com`. */
  production: boolean;
}

/** Credentials FCM HTTP v1 (compte de service Google). */
export interface FcmConfig {
  /** Identifiant du projet Firebase — chemin `…/projects/<id>/messages:send`. */
  projectId: string;
  /** Email du compte de service — claim `iss` du JWT OAuth2. */
  clientEmail: string;
  /** Clé privée RS256 du compte de service, au format PEM. */
  privateKey: string;
}

/** Configuration résolue : chaque plateforme est présente ou absente. */
export interface PushConfig {
  apns: ApnsConfig | null;
  fcm: FcmConfig | null;
}

/** Lecteur de variables d'environnement (injectable pour les tests). */
export type EnvGetter = (key: string) => string | undefined;

const APNS_KEYS = ['APNS_KEY_ID', 'APNS_TEAM_ID', 'APNS_BUNDLE_ID', 'APNS_PRIVATE_KEY'] as const;
const FCM_KEYS = ['FCM_PROJECT_ID', 'FCM_CLIENT_EMAIL', 'FCM_PRIVATE_KEY'] as const;

/**
 * Les clés PEM passées par variable d'environnement ont souvent leurs sauts de
 * ligne échappés (`\n` littéral). On les restaure pour obtenir un PEM lisible —
 * même convention que `JWT_PRIVATE_KEY` (cf. env.validation).
 */
export function normalizePem(value: string): string {
  return value.replace(/\\n/g, '\n').trim();
}

/** Booléen tolérant (« true »/« 1 »/« yes »), insensible à la casse. */
function parseBool(value: string | undefined): boolean {
  return value !== undefined && /^(true|1|yes)$/i.test(value.trim());
}

/** Sous-ensemble présent (valeur non vide) parmi un groupe de clés. */
function presentKeys(get: EnvGetter, keys: readonly string[]): string[] {
  return keys.filter((k) => (get(k) ?? '').trim().length > 0);
}

/**
 * Valide la complétude tout-ou-rien des deux groupes de credentials. Renvoie la
 * liste des erreurs (vide si cohérent). Branchée dans `validateEnv` (fail-fast).
 */
export function validatePushEnv(get: EnvGetter): string[] {
  const errors: string[] = [];
  for (const [label, keys] of [
    ['APNs', APNS_KEYS],
    ['FCM', FCM_KEYS],
  ] as const) {
    const present = presentKeys(get, keys);
    if (present.length > 0 && present.length < keys.length) {
      const missing = keys.filter((k) => !present.includes(k));
      errors.push(
        `Configuration ${label} incomplète : ${missing.join(', ')} manquant(s) ` +
          `(tout-ou-rien — fournir tous les credentials ${label} ou aucun)`,
      );
    }
  }
  return errors;
}

/**
 * Résout la configuration push depuis l'environnement. Suppose la complétude déjà
 * validée par `validatePushEnv` ; un groupe partiel est ici traité comme absent.
 */
export function parsePushConfig(get: EnvGetter): PushConfig {
  const apnsComplete = presentKeys(get, APNS_KEYS).length === APNS_KEYS.length;
  const fcmComplete = presentKeys(get, FCM_KEYS).length === FCM_KEYS.length;

  const apns: ApnsConfig | null = apnsComplete
    ? {
        keyId: (get('APNS_KEY_ID') as string).trim(),
        teamId: (get('APNS_TEAM_ID') as string).trim(),
        bundleId: (get('APNS_BUNDLE_ID') as string).trim(),
        privateKey: normalizePem(get('APNS_PRIVATE_KEY') as string),
        production: parseBool(get('APNS_PRODUCTION')),
      }
    : null;

  const fcm: FcmConfig | null = fcmComplete
    ? {
        projectId: (get('FCM_PROJECT_ID') as string).trim(),
        clientEmail: (get('FCM_CLIENT_EMAIL') as string).trim(),
        privateKey: normalizePem(get('FCM_PRIVATE_KEY') as string),
      }
    : null;

  return { apns, fcm };
}
