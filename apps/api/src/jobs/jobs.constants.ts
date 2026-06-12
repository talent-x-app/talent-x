/**
 * Constantes partagées de la file de jobs asynchrones (ADR-09/13).
 * Le producteur (API, `ExportQueueService`) et le consommateur (worker) s'y
 * réfèrent pour rester alignés sur le nom de file et la forme du payload.
 */

/** File des exports RGPD. */
export const DATA_EXPORT_QUEUE = 'data-export';

/** Nom du job d'export au sein de la file. */
export const EXPORT_JOB_NAME = 'export-user-data';

/** Payload d'un job d'export. `jobId` = id de la ligne `export_jobs` (= jobId API). */
export interface ExportJobPayload {
  jobId: string;
  userId: string;
}

/** File des notifications push (ADR-22). */
export const NOTIFICATIONS_QUEUE = 'notifications';

/** Nom du job d'envoi au sein de la file. */
export const NOTIFICATION_JOB_NAME = 'send-push';

/**
 * Taxonomie des événements notifiables (ADR-22) — chaque type est gardé par la
 * préférence du même nom côté destinataire. `marketing` n'a aucune émission au MVP.
 */
export type NotificationType = 'session_assigned' | 'performance_feedback' | 'group_update';

/**
 * Payload d'un job de notification — minimal et non sensible (ADR-10) : un signal
 * typé + l'identifiant de la ressource à ouvrir, jamais de contenu métier.
 * `dedupeKey` (= jobId BullMQ) sert aussi de clé d'idempotence à la persistance
 * in-app (ADR-23 : unique `notifications.dedupe_key`).
 */
export interface NotificationJobPayload {
  type: NotificationType;
  recipientUserId: string;
  resourceId: string;
  dedupeKey: string;
}

/** File des emails transactionnels (TLX-104). */
export const TRANSACTIONAL_EMAIL_QUEUE = 'transactional-email';

/** Nom du job d'email au sein de la file. */
export const EMAIL_JOB_NAME = 'send-email';

/** Catégories d'emails transactionnels (MVP : réinitialisation de mot de passe). */
export type EmailKind = 'password_reset';

/**
 * Payload d'un job d'email. Le rendu (sujet, corps, lien) est composé par le
 * worker à partir du `kind` et de `params` : ainsi le jeton de réinitialisation
 * en clair ne transite que par la file (jamais persisté), comme le refresh token.
 */
export interface EmailJobPayload {
  kind: EmailKind;
  to: string;
  /** Données de rendu propres au `kind` (ex. `{ token }` pour password_reset). */
  params: Record<string, string>;
}
