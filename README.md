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
docker compose up -d                                 # PostgreSQL + Redis (dev)
cp apps/api/.env.example apps/api/.env               # config locale (non versionnée)
pnpm --filter @talent-x/api prisma migrate deploy    # applique les migrations (voir apps/api/prisma/README.md)
pnpm --filter @talent-x/api seed                      # données de dev (talent-x-sample-data.json)
pnpm --filter @talent-x/api dev
pnpm --filter @talent-x/mobile start
```

> Migrations : utiliser `migrate deploy`, **jamais `migrate dev`** — voir
> `apps/api/prisma/README.md` (le schéma Prisma ne couvre pas les index partiels,
> CHECK et triggers, que `migrate dev` supprimerait).

## Environnements & secrets

Trois environnements (cf. `docs/Talent-X_04_Deploiement_exploitation_v2.md` §2) :

| Env             | Rôle             | Infra                                                            |
| --------------- | ---------------- | ---------------------------------------------------------------- |
| **development** | itération locale | `docker-compose.yml` (PostgreSQL + Redis) ; API/worker côté hôte |
| **staging**     | pré-production   | réplique simplifiée de la prod (migrations + E2E)                |
| **production**  | service live     | reverse proxy + API + worker(s) + base + cache (OVHcloud, UE)    |

**Configuration** : les variables sont validées au démarrage de l'API
(`apps/api/src/config/env.validation.ts`) — l'API refuse de démarrer si une
variable requise manque ou est invalide (fail-fast). Variables documentées dans
`apps/api/.env.example`.

**Secrets** : aucun secret n'est versionné. En dev, `apps/api/.env` (gitignored)
reprend les défauts **non secrets** du Docker Compose. En staging/prod, les
valeurs proviennent des **secrets d'environnement** de la plateforme (jamais d'un
fichier du dépôt) ; les clés de chiffrement des sauvegardes sont conservées hors
du nœud (cf. `docs/Talent-X_03_Securite_RGPD_v2.md`).

## Qualité & CI

Outils (config à la racine) :

- **ESLint** (`eslint.config.mjs`, flat config) + **Prettier** (`.prettierrc.json`)
- **TypeScript strict** (`packages/tsconfig/base.json`, `strict: true`)
- **Husky + lint-staged** : hook `pre-commit` qui lint/formate les fichiers indexés

Commandes :

```
pnpm lint            # ESLint sur tout le mono-repo
pnpm lint:fix        # + corrections automatiques
pnpm format          # Prettier --write
pnpm format:check    # Prettier --check (utilisé en CI)
pnpm -r typecheck
pnpm -r --if-present test
pnpm -r build
```

La CI (GitHub Actions, `.github/workflows/ci.yml`) rejoue ces contrôles sur chaque
push `main` et chaque pull request : **lint → format → build → typecheck → tests**.

## Travailler avec Claude Code

Voir `CLAUDE.md` (carte du projet) et `CURRENT_SPRINT.md` (cycle en cours).
