/**
 * Setup des tests d'INTÉGRATION DB-backed (TLX-79). Contrairement aux e2e
 * « sans base » (setup-e2e.ts), ces tests exigent une **vraie base** migrée :
 * - en local : `docker compose up -d` + `prisma migrate deploy` (DATABASE_URL via .env) ;
 * - en CI : service `postgres` + `migrate deploy` (DATABASE_URL injecté par le workflow).
 *
 * On force NODE_ENV=test (clé RS256 éphémère acceptée) et on NE fixe PAS
 * DATABASE_URL : il vient de l'environnement réel (.env chargé par AppModule, ou
 * variable du job CI). Les tests créent leurs propres fixtures et les nettoient.
 *
 * `testTimeout: 30000` (jest-integration.json) — TLX-277. Le `beforeAll` de chaque suite
 * compile tout `AppModule` et ouvre une connexion Postgres : sur une machine froide, cela
 * dépasse les **5 s** par défaut de Jest. La suite entière tombe alors sur un timeout de
 * hook, ce qui se lit comme 23 tests en échec au lieu des vrais. Sans ce réglage, la
 * commande du dépôt ne peut pas valider un correctif d'intégration en local — et c'est
 * précisément la vérification qu'aucun de nous n'a pu faire avant que `main` parte rouge.
 */
process.env.NODE_ENV ??= 'test';
