// Client API typé Talent-X, consommé par l'app mobile via TanStack Query (TLX-009).
//
// Le client et les modèles sont GÉNÉRÉS depuis docs/talent-x-openapi.yaml (orval) :
// ne pas éditer src/generated/** à la main. Régénérer après évolution du contrat :
//   pnpm --filter @talent-x/api-client generate
//
// Configuration (URL de base, en-têtes d'auth) via `configureApiClient`.

export * from './generated/talent-x';
export * from './generated/model';
export { configureApiClient, resetApiClient, type ApiClientConfig } from './mutator/custom-fetch';
