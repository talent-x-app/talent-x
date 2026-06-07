# Sprint courant : S-00 — Fondations

Objectif de fin de cycle : l'app démarre avec le thème, la CI est verte, la base est seedée.

## À faire

- **TLX-015** Harnais de tests : Jest (unit) + Maestro (e2e mobile) + e2e API

## En cours

- _(rien)_

## Terminés ce sprint

- **TLX-001** Initialiser le mono-repo (Expo + NestJS + Prisma, pnpm workspaces) — PR #1 mergée
- **TLX-005** Design system en code : tokens RN + CSS + thème typé — PR #2 mergée
- **TLX-012** Schéma Prisma depuis le modèle de données + migration initiale — PR #3 mergée
- **TLX-011** Squelette NestJS + DTO/contrôleurs depuis l'OpenAPI — PR #4 mergée
- **TLX-013** Journalisation JSON + correlation ID + readiness — PR #6 mergée
- **TLX-003** Pipeline CI (lint, format, typecheck, tests, build) — mergé
- **TLX-002** Config qualité : ESLint + Prettier + Husky/lint-staged (TS strict déjà actif) — mergé
- **TLX-004** Environnements dev/staging/prod + secrets : docker-compose (PostgreSQL + Redis) + validation d'env fail-fast — mergé
- **TLX-014** Seed de la base de dev depuis talent-x-sample-data.json + validation du jeu — mergé

## Notes / dépendances

- Base dev : `docker compose up -d` puis `pnpm --filter @talent-x/api prisma migrate deploy` puis `pnpm --filter @talent-x/api seed`.
- Seed non exécuté de bout en bout en CI/cet environnement (pas de Docker/DB) : le jeu livré est validé par test unitaire, et seed.ts est typé contre le client Prisma généré.
- Le `JwtAuthGuard` (TLX-011) n'est pas enregistré globalement : à brancher avec la stratégie JWT RS256 dans le ticket Auth.
