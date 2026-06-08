/** Hook d'état de connectivité (TLX-010). `true` = en ligne (optimiste au départ). */
import { useEffect, useState } from 'react';
import { subscribeNetwork } from './network-monitor';

export function useNetworkStatus(): boolean {
  // Optimiste au démarrage : on n'affiche le bandeau que sur un hors-ligne avéré.
  const [online, setOnline] = useState(true);

  useEffect(() => subscribeNetwork(setOnline), []);

  return online;
}
