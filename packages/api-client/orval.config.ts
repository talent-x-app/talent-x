import { defineConfig } from 'orval';

// Génération du client API typé depuis le contrat OpenAPI (TLX-008).
// Source de vérité : docs/talent-x-openapi.yaml. Ne pas éditer le code généré
// (src/generated/**) à la main : relancer `pnpm --filter @talent-x/api-client generate`.
//
// Le client `fetch` n'ajoute aucune dépendance runtime. Toutes les requêtes
// passent par le mutator `customFetch`, qui centralise l'URL de base et les
// en-têtes (seam pour l'auth/refresh — câblé en TLX-009, ici non couplé).
export default defineConfig({
  'talent-x': {
    input: {
      target: '../../docs/talent-x-openapi.yaml',
    },
    output: {
      mode: 'split',
      target: './src/generated/talent-x.ts',
      schemas: './src/generated/model',
      client: 'fetch',
      clean: true,
      prettier: false,
      override: {
        mutator: {
          path: './src/mutator/custom-fetch.ts',
          name: 'customFetch',
        },
      },
    },
  },
});
