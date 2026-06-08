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
