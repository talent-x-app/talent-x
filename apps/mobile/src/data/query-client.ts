/**
 * Fabrique du QueryClient TanStack Query (TLX-009).
 * Cache de l'état serveur, invalidation et mutations (TX-ARCH-001 §6.1).
 * Défauts adaptés au mobile : on évite le refetch au focus (coûteux en data)
 * et on ne réessaie pas les erreurs d'auth/permission (4xx) — seul le réseau
 * mérite quelques reprises.
 */
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { emitToast } from '../feedback/toast-bridge';
import { toUserMessage } from '../feedback/error-message';

/** Erreur portant un statut HTTP (cf. enveloppe orval { status, data }). */
function statusOf(error: unknown): number | undefined {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status: unknown }).status;
    return typeof status === 'number' ? status : undefined;
  }
  return undefined;
}

/** Toast d'erreur global (TLX-010) ; le 401 est traité par le refresh d'auth (TLX-009). */
function reportError(error: unknown): void {
  if (statusOf(error) === 401) return;
  emitToast({ ...toUserMessage(error), variant: 'danger' });
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    // Gestion d'erreurs globale : toute requête/mutation en échec déclenche un
    // toast (sauf 401, géré par le rafraîchissement de session).
    queryCache: new QueryCache({ onError: reportError }),
    mutationCache: new MutationCache({ onError: reportError }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          const status = statusOf(error);
          // Ne pas réessayer les erreurs client (4xx) : authz, validation, 404.
          if (status !== undefined && status >= 400 && status < 500) return false;
          return failureCount < 2;
        },
      },
      mutations: { retry: false },
    },
  });
}
