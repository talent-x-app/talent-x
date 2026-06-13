/**
 * Synchronisation de la file d'écriture des perfs (TLX-077). Monté une fois à la racine
 * (`OfflineSync`), il **rejoue la file** au démarrage si l'on est en ligne, puis à chaque
 * retour de connectivité (transition hors-ligne → en ligne). Les écritures confirmées
 * invalident le cache TanStack Query concerné et purgent le brouillon local correspondant.
 */
import { submitPerformance, updatePerformance } from '@talent-x/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useNetworkStatus, useToast } from '../feedback';
import { deviceStore } from './key-value-store';
import { clearDraft } from './perf-draft';
import { flushOutbox, type FlushOutcome, type OutboxItem } from './perf-outbox';

/**
 * Envoie un item de la file. Idempotent côté serveur (clé `Idempotency-Key` pour `submit`,
 * unicité de l'affectation). Mappe le statut HTTP en issue de flush :
 *  - 2xx → `sent` ; 5xx → `retry` (transitoire) ; 4xx → `drop` (permanent, non réparable par rejeu).
 * Une panne réseau lève → `flushOutbox` la convertit en `retry`.
 */
export async function sendPerfItem(item: OutboxItem): Promise<FlushOutcome> {
  const response =
    item.kind === 'update'
      ? await updatePerformance(item.assignmentId, item.body)
      : await submitPerformance(item.assignmentId, item.body, {
          headers: { 'Idempotency-Key': item.idempotencyKey },
        });
  const status = response.status;
  if (status === 200 || status === 201) return 'sent';
  if (status >= 500) return 'retry';
  return 'drop';
}

export function useOfflineSync(): void {
  const online = useNetworkStatus();
  const queryClient = useQueryClient();
  const toast = useToast();
  const flushing = useRef(false);

  useEffect(() => {
    if (!online) return;
    let cancelled = false;

    void (async () => {
      if (flushing.current) return;
      flushing.current = true;
      try {
        const summary = await flushOutbox(deviceStore, sendPerfItem);
        if (cancelled) return;

        // Rafraîchit l'écran de chaque affectation touchée (envoyée ou abandonnée) ; purge le
        // brouillon des seules perfs **confirmées** (un drop conserve le brouillon pour reprise).
        for (const item of summary.sent) {
          void clearDraft(deviceStore, item.assignmentId);
          void queryClient.invalidateQueries({ queryKey: ['assignment', item.assignmentId] });
        }
        for (const item of summary.dropped) {
          void queryClient.invalidateQueries({ queryKey: ['assignment', item.assignmentId] });
        }

        if (summary.sent.length > 0) {
          void queryClient.invalidateQueries({ queryKey: ['assignments'] });
          toast.show({
            title:
              summary.sent.length > 1
                ? `${summary.sent.length} performances synchronisées`
                : 'Performance synchronisée',
            variant: 'success',
          });
        }
        if (summary.dropped.length > 0) {
          toast.show({
            title: 'Synchronisation impossible',
            description:
              'Une saisie hors ligne a été refusée (consentement ou validation). Rouvre la séance pour la corriger.',
            variant: 'danger',
            duration: 0,
          });
        }
      } finally {
        flushing.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [online, queryClient, toast]);
}

/** Composant sans rendu — branche la synchronisation hors-ligne à la racine de l'app. */
export function OfflineSync(): null {
  useOfflineSync();
  return null;
}
