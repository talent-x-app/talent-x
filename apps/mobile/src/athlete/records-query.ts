/**
 * Clé de cache des records personnels de l'athlète (A-07). Extraite dans un module sans
 * dépendance UI (comme `dashboard-query.ts`) pour que les composants qui invalident ce cache
 * (éditeur manuel TLX-116, journal libre TLX-111) ne tirent pas tout le graphe de l'écran.
 */
export const MY_RECORDS_QUERY_KEY = ['records', 'me'] as const;
