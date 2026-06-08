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
push `main` et chaque pull request : **lint → format → build → typecheck → tests
unitaires → e2e API**.

## Tests

Harnais aligné sur la stratégie de test (`docs/Talent-X_04_Deploiement_exploitation_v2.md` §6).

| Niveau                | Outils                             | Emplacement                            |
| --------------------- | ---------------------------------- | -------------------------------------- |
| Unitaire backend      | Jest + ts-jest                     | `apps/api/src/**/*.spec.ts`            |
| Intégration / e2e API | Jest + Supertest                   | `apps/api/test/*.e2e-spec.ts`          |
| Unitaire mobile       | Jest (jest-expo) + Testing Library | `apps/mobile/**/*.test.tsx`            |
| Design system         | Jest + ts-jest                     | `packages/design-tokens/src/*.test.ts` |
| E2E mobile            | Maestro                            | `apps/mobile/.maestro/*.yaml`          |

```
pnpm -r --if-present test                 # tous les tests unitaires (api, mobile, design-tokens)
pnpm --filter @talent-x/api test          # unitaires backend
pnpm --filter @talent-x/api test:e2e      # e2e API (Supertest, base factice)
pnpm --filter @talent-x/api test:cov      # + couverture
pnpm --filter @talent-x/mobile test       # unitaires mobile
```

Les tests unitaires et e2e API ne requièrent **aucune base réelle** : la validation
d'environnement passe avec une base factice et les tests vérifient le comportement
« base indisponible » (readiness → 503), comme en CI.

### E2E mobile (Maestro)

Les parcours critiques mobiles sont décrits en flux [Maestro](https://maestro.mobile.dev)
(`apps/mobile/.maestro/`). Ils nécessitent un **simulateur/appareil** avec l'app
installée — non joués en CI (cf. §6, joués en staging ou manuellement) :

```
curl -Ls "https://get.maestro.mobile.dev" | bash    # installe Maestro (une fois)
pnpm --filter @talent-x/mobile start                 # démarre l'app (Expo Go / dev build)
maestro test apps/mobile/.maestro/smoke.yaml         # joue le smoke test
```

> `appId` dans les flux cible Expo Go (`host.exp.Exponent`) ; en build native/EAS,
> le remplacer par l'identifiant de `apps/mobile/app.json` (`ios.bundleIdentifier` /
> `android.package`).

## Travailler avec Claude Code

Voir `CLAUDE.md` (carte du projet) et `CURRENT_SPRINT.md` (cycle en cours).
