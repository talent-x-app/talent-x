import type { KeyValueStore } from './key-value-store';
import {
  enqueuePerf,
  findOutboxItem,
  flushOutbox,
  loadOutbox,
  parseOutbox,
  removeOutboxItem,
  removeQueued,
  upsertOutboxItem,
  type FlushOutcome,
  type OutboxItem,
} from './perf-outbox';

function memoryStore(): KeyValueStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: async (k) => map.get(k) ?? null,
    setItem: async (k, v) => void map.set(k, v),
    removeItem: async (k) => void map.delete(k),
  };
}

function item(assignmentId: string, kind: OutboxItem['kind'] = 'submit'): OutboxItem {
  return {
    assignmentId,
    kind,
    body: { results: { schemaVersion: 2, items: [] }, rpe: 7 },
    idempotencyKey: `perf-${assignmentId}`,
    queuedAt: '2026-06-13T10:00:00.000Z',
  };
}

describe('perf-outbox (TLX-077 — file d’écriture)', () => {
  describe('opérations pures', () => {
    it('upsert : ajoute un nouvel item, en remplace un existant (un seul par affectation)', () => {
      const q1 = upsertOutboxItem([], item('as-1'));
      expect(q1).toHaveLength(1);
      const q2 = upsertOutboxItem(q1, {
        ...item('as-1'),
        idempotencyKey: 'perf-as-1',
        rpe: 9,
      } as OutboxItem);
      expect(q2).toHaveLength(1); // remplacé, pas dupliqué
      expect(upsertOutboxItem(q2, item('as-2'))).toHaveLength(2);
    });

    it('upsert : un submit en attente ne régresse jamais vers update (idempotence serveur)', () => {
      const queued = upsertOutboxItem([], item('as-1', 'submit'));
      const next = upsertOutboxItem(queued, item('as-1', 'update'));
      expect(findOutboxItem(next, 'as-1')?.kind).toBe('submit');
    });

    it('upsert : un update reste un update s’il est réémis', () => {
      const queued = upsertOutboxItem([], item('as-1', 'update'));
      const next = upsertOutboxItem(queued, item('as-1', 'update'));
      expect(findOutboxItem(next, 'as-1')?.kind).toBe('update');
    });

    it('remove / find ciblent la bonne affectation', () => {
      const q = [item('as-1'), item('as-2')];
      expect(findOutboxItem(q, 'as-2')?.assignmentId).toBe('as-2');
      expect(removeOutboxItem(q, 'as-1')).toEqual([item('as-2')]);
    });

    it('parse défensif : absent / corrompu / non-tableau / items invalides écartés', () => {
      expect(parseOutbox(null)).toEqual([]);
      expect(parseOutbox('{bad')).toEqual([]);
      expect(parseOutbox(JSON.stringify({}))).toEqual([]);
      expect(parseOutbox(JSON.stringify([item('as-1'), { assignmentId: 'x' }]))).toEqual([
        item('as-1'),
      ]);
    });
  });

  describe('persistance', () => {
    it('enqueue persiste et dédoublonne par affectation', async () => {
      const store = memoryStore();
      await enqueuePerf(store, item('as-1'));
      await enqueuePerf(store, item('as-1'));
      await enqueuePerf(store, item('as-2'));
      expect(await loadOutbox(store)).toHaveLength(2);
    });

    it('removeQueued retire l’item d’une affectation', async () => {
      const store = memoryStore();
      await enqueuePerf(store, item('as-1'));
      await removeQueued(store, 'as-1');
      expect(await loadOutbox(store)).toEqual([]);
    });
  });

  describe('flushOutbox', () => {
    it('envoie les items, retire les sent, conserve les retry, retire+remonte les drop', async () => {
      const store = memoryStore();
      await enqueuePerf(store, item('sent-1'));
      await enqueuePerf(store, item('retry-1'));
      await enqueuePerf(store, item('drop-1'));

      const outcomes: Record<string, FlushOutcome> = {
        'sent-1': 'sent',
        'retry-1': 'retry',
        'drop-1': 'drop',
      };
      const summary = await flushOutbox(store, async (i) => outcomes[i.assignmentId]);

      expect(summary.sent.map((i) => i.assignmentId)).toEqual(['sent-1']);
      expect(summary.dropped.map((i) => i.assignmentId)).toEqual(['drop-1']);
      expect(summary.retried.map((i) => i.assignmentId)).toEqual(['retry-1']);
      // Seul le retry reste en file.
      expect((await loadOutbox(store)).map((i) => i.assignmentId)).toEqual(['retry-1']);
    });

    it('une exception du sender est traitée comme retry (réseau encore instable)', async () => {
      const store = memoryStore();
      await enqueuePerf(store, item('as-1'));
      const summary = await flushOutbox(store, async () => {
        throw new Error('network down');
      });
      expect(summary.retried).toHaveLength(1);
      expect(await loadOutbox(store)).toHaveLength(1);
    });

    it('file vide : aucun envoi, résumé vide', async () => {
      const store = memoryStore();
      const send = jest.fn();
      const summary = await flushOutbox(store, send);
      expect(send).not.toHaveBeenCalled();
      expect(summary).toEqual({ sent: [], dropped: [], retried: [] });
    });
  });
});
