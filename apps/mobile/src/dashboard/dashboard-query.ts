/**
 * Clé de cache du tableau de bord coach (TLX-080/081). Isolée dans un module **sans
 * dépendance UI** : les écrans qui ne font qu'invalider/partager ce cache (C-02, fil de
 * feedback, assignation) l'importent sans tirer tout le graphe de `CoachDashboardScreen`
 * (et ses sections → enums runtime). Évite des charges transitives inutiles en test.
 */
export const COACH_DASHBOARD_QUERY_KEY = ['coach', 'dashboard'] as const;
