/**
 * Setup des tests d'INTÉGRATION DB-backed (TLX-79). Contrairement aux e2e
 * « sans base » (setup-e2e.ts), ces tests exigent une **vraie base** migrée :
 * - en local : `docker compose up -d` + `prisma migrate deploy` (DATABASE_URL via .env) ;
 * - en CI : service `postgres` + `migrate deploy` (DATABASE_URL injecté par le workflow).
 *
 * On force NODE_ENV=test (clé RS256 éphémère acceptée) et on NE fixe PAS
 * DATABASE_URL : il vient de l'environnement réel (.env chargé par AppModule, ou
 * variable du job CI). Les tests créent leurs propres fixtures et les nettoient.
 */
process.env.NODE_ENV ??= 'test';
