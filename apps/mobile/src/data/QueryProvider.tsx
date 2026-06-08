/**
 * Fournit le cache TanStack Query à l'arbre et initialise la couche données
 * (TLX-009). Le QueryClient est créé une seule fois (stable entre rendus) et
 * `setupApiClient` est exécuté au montage (config API + hydratation des jetons).
 */
import { QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useEffect, useState } from 'react';
import { createQueryClient } from './query-client';
import { setupApiClient } from './setup';

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);

  useEffect(() => {
    void setupApiClient();
  }, []);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
