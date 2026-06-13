/**
 * File d'écriture locale des performances (TLX-077, TX-ARCH-001 §6.2).
 *
 * Une perf saisie hors ligne (ou dont l'envoi échoue sur panne réseau) est **mise en file**
 * localement et **rejouée à la reconnexion** (`flushOutbox`). Garanties de la spec :
 *  - **Idempotence** : chaque item porte sa clé `Idempotency-Key` (dérivée de l'affectation)
 *    → un rejeu après reprise réseau ne crée pas de doublon côté serveur (ADR-12).
 *  - **Conflit déterministe** : une affectation n'accepte qu'une soumission ; on ne garde donc
 *    **qu'un seul item en attente par affectation** (le plus récent remplace), et un item resté
 *    `submit` (perf jamais partie au serveur) ne « régresse » jamais vers `update`.
 *
 * Module pur : toute l'IO passe par le `KeyValueStore` et le `OutboxSender` injectés.
 */
import type { PerformanceCreate } from '@talent-x/api-client';
import type { KeyValueStore } from './key-value-store';

const OUTBOX_KEY = 'perf-outbox';

export type OutboxKind = 'submit' | 'update';

/** Une écriture de perf en attente de synchronisation. */
export interface OutboxItem {
  assignmentId: string;
  kind: OutboxKind;
  body: PerformanceCreate;
  idempotencyKey: string;
  /** Horodatage ISO de mise en file. */
  queuedAt: string;
}

/**
 * Insère/remplace l'item d'une affectation (un seul en attente par affectation). Si un item
 * `submit` est déjà en file (perf pas encore créée côté serveur), on **conserve `submit`** même
 * si l'appelant repropose un `update` — l'idempotence serveur reposant sur l'existence de la perf.
 */
export function upsertOutboxItem(queue: OutboxItem[], item: OutboxItem): OutboxItem[] {
  const index = queue.findIndex((q) => q.assignmentId === item.assignmentId);
  if (index < 0) return [...queue, item];
  const next = queue.slice();
  const previous = next[index];
  next[index] = { ...item, kind: previous.kind === 'submit' ? 'submit' : item.kind };
  return next;
}

export function removeOutboxItem(queue: OutboxItem[], assignmentId: string): OutboxItem[] {
  return queue.filter((q) => q.assignmentId !== assignmentId);
}

export function findOutboxItem(queue: OutboxItem[], assignmentId: string): OutboxItem | undefined {
  return queue.find((q) => q.assignmentId === assignmentId);
}

function isOutboxItem(value: unknown): value is OutboxItem {
  const v = value as Partial<OutboxItem> | null;
  return (
    !!v &&
    typeof v.assignmentId === 'string' &&
    (v.kind === 'submit' || v.kind === 'update') &&
    typeof v.idempotencyKey === 'string' &&
    !!v.body &&
    typeof v.body === 'object'
  );
}

/** Relit une file sérialisée — défensif (JSON corrompu / items invalides écartés). */
export function parseOutbox(raw: string | null | undefined): OutboxItem[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.filter(isOutboxItem) : [];
  } catch {
    return [];
  }
}

export async function loadOutbox(store: KeyValueStore): Promise<OutboxItem[]> {
  return parseOutbox(await store.getItem(OUTBOX_KEY));
}

export async function saveOutbox(store: KeyValueStore, queue: OutboxItem[]): Promise<void> {
  await store.setItem(OUTBOX_KEY, JSON.stringify(queue));
}

/** Met en file (upsert) un envoi de perf et renvoie la file résultante. */
export async function enqueuePerf(store: KeyValueStore, item: OutboxItem): Promise<OutboxItem[]> {
  const next = upsertOutboxItem(await loadOutbox(store), item);
  await saveOutbox(store, next);
  return next;
}

export async function removeQueued(store: KeyValueStore, assignmentId: string): Promise<void> {
  await saveOutbox(store, removeOutboxItem(await loadOutbox(store), assignmentId));
}

/**
 * Issue d'une tentative d'envoi d'un item :
 *  - `sent` : accepté par le serveur (2xx, ou rejeu idempotent) → retiré de la file ;
 *  - `retry` : échec **transitoire** (réseau, 5xx) → conservé pour un prochain flush ;
 *  - `drop` : échec **permanent** (4xx : consentement, validation, affectation disparue) →
 *    retiré de la file et **remonté** à l'utilisateur (un rejeu ne le réparerait pas).
 */
export type FlushOutcome = 'sent' | 'retry' | 'drop';

export type OutboxSender = (item: OutboxItem) => Promise<FlushOutcome>;

export interface FlushSummary {
  sent: OutboxItem[];
  dropped: OutboxItem[];
  retried: OutboxItem[];
}

/**
 * Rejoue la file via le `sender` injecté. Traite les items séquentiellement (l'ordre de saisie
 * est préservé), conserve les `retry`, retire `sent`/`drop`, et ne réécrit le stockage que si la
 * file a changé. Une exception du `sender` est traitée comme `retry` (réseau encore instable).
 */
export async function flushOutbox(store: KeyValueStore, send: OutboxSender): Promise<FlushSummary> {
  const queue = await loadOutbox(store);
  const summary: FlushSummary = { sent: [], dropped: [], retried: [] };
  const remaining: OutboxItem[] = [];
  for (const item of queue) {
    let outcome: FlushOutcome;
    try {
      outcome = await send(item);
    } catch {
      outcome = 'retry';
    }
    if (outcome === 'sent') summary.sent.push(item);
    else if (outcome === 'drop') summary.dropped.push(item);
    else {
      summary.retried.push(item);
      remaining.push(item);
    }
  }
  if (remaining.length !== queue.length) await saveOutbox(store, remaining);
  return summary;
}
