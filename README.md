# Talent-X

Application mobile d'athlétisme reliant coachs et athlètes.

## Structure
- `apps/mobile` — application Expo / React Native
- `apps/api` — API NestJS
- `packages/` — code partagé (client API généré, design tokens, tsconfig)
- `docs/` — spécifications techniques + contrat OpenAPI + ADR + backlog
- `design/` — design system, marque, cartes d'écran et wireframes
- `tools/` — scripts utilitaires

## Démarrage
```
pnpm install
pnpm --filter @talent-x/api prisma migrate deploy   # applique les migrations (voir apps/api/prisma/README.md)
pnpm --filter @talent-x/api dev
pnpm --filter @talent-x/mobile start
```
> Migrations : utiliser `migrate deploy`, **jamais `migrate dev`** — voir
> `apps/api/prisma/README.md` (le schéma Prisma ne couvre pas les index partiels,
> CHECK et triggers, que `migrate dev` supprimerait).

## Qualité & CI
La CI (GitHub Actions, `.github/workflows/ci.yml`) s'exécute sur chaque push `main`
et chaque pull request : **typecheck → tests → build** sur tout le mono-repo.
Reproduire localement :
```
pnpm -r typecheck
pnpm -r --if-present test
pnpm -r build
```
Le lint (ESLint) sera branché dans la CI avec TLX-002.

## Travailler avec Claude Code
Voir `CLAUDE.md` (carte du projet) et `CURRENT_SPRINT.md` (cycle en cours).
