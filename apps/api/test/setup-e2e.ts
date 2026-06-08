/**
 * Setup des tests e2e (TLX-015) — exécuté avant le chargement des modules.
 * Pose des variables d'environnement de test par défaut afin que la validation
 * fail-fast (env.validation.ts) passe sans dépendre de la machine. La base
 * pointée est factice et injoignable : les tests vérifient justement le
 * comportement « base indisponible » (readiness → 503), comme en CI.
 * Aucun secret : valeurs non sensibles vers une base inexistante.
 */
process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test?schema=public';
