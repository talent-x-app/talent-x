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
pnpm --filter @talent-x/api prisma migrate dev
pnpm --filter @talent-x/api dev
pnpm --filter @talent-x/mobile start
```

## Travailler avec Claude Code
Voir `CLAUDE.md` (carte du projet) et `CURRENT_SPRINT.md` (cycle en cours).
