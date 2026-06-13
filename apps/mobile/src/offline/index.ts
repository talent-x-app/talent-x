/**
 * Persistance hors-ligne de la saisie de performance (TLX-077, TX-ARCH-001 §6.2) :
 * brouillon auto-sauvegardé + file d'écriture rejouée à la reconnexion.
 */
export { type KeyValueStore, deviceStore } from './key-value-store';
export {
  type PerfDraft,
  draftKey,
  serializeDraft,
  parseDraft,
  saveDraft,
  loadDraft,
  clearDraft,
} from './perf-draft';
export {
  type OutboxItem,
  type OutboxKind,
  type OutboxSender,
  type FlushOutcome,
  type FlushSummary,
  upsertOutboxItem,
  removeOutboxItem,
  findOutboxItem,
  parseOutbox,
  loadOutbox,
  saveOutbox,
  enqueuePerf,
  removeQueued,
  flushOutbox,
} from './perf-outbox';
export { useOfflineSync, OfflineSync, sendPerfItem } from './useOfflineSync';
