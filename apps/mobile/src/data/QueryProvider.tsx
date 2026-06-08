/**
 * Fournit le cache TanStack Query à l'arbre (TLX-009). Le QueryClient est créé
 * une seule fois (stable entre rendus).
 *
 * L'initialisation de la couche données (config du client API + hydratation des
 * jetons + refresh silencieux) est faite par `SessionProvider` au démarrage
 * (`setupApiClient` puis `restoreSession`, TLX-027) — propriétaire unique du
 * bootstrap, pour garantir l'ordre et éviter toute course sur le cache de jetons.
 */
import { QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { createQueryClient } from './query-client';

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
