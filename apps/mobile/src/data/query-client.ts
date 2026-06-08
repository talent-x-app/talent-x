/**
 * Fabrique du QueryClient TanStack Query (TLX-009).
 * Cache de l'état serveur, invalidation et mutations (TX-ARCH-001 §6.1).
 * Défauts adaptés au mobile : on évite le refetch au focus (coûteux en data)
 * et on ne réessaie pas les erreurs d'auth/permission (4xx) — seul le réseau
 * mérite quelques reprises.
 */
import { QueryClient } from '@tanstack/react-query';

/** Erreur portant un statut HTTP (cf. enveloppe orval { status, data }). */
function statusOf(error: unknown): number | undefined {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status: unknown }).status;
    return typeof status === 'number' ? status : undefined;
  }
  return undefined;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
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
