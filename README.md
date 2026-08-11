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
docker compose up -d                                 # PostgreSQL + Redis + MinIO (dev)
cp apps/api/.env.example apps/api/.env               # config locale (non versionnée)
pnpm --filter @talent-x/api prisma migrate deploy    # applique les migrations (voir apps/api/prisma/README.md)
pnpm --filter @talent-x/api seed                      # données de dev (talent-x-sample-data.json)
pnpm --filter @talent-x/api dev
pnpm --filter @talent-x/api worker:dev               # worker BullMQ (voir « Runbook dev » ↓)
pnpm --filter @talent-x/mobile start
```

> Migrations : utiliser `migrate deploy`, **jamais `migrate dev`** — voir
> `apps/api/prisma/README.md` (le schéma Prisma ne couvre pas les index partiels,
> CHECK et triggers, que `migrate dev` supprimerait).

## Runbook dev — worker, MinIO & pièges connus

Deux fonctionnalités sont **cassées en local par défaut** si l'on ne lance que l'API
(constat du test manuel coach, `apps/mobile/e2e/RAPPORT_TEST_MANUEL_COACH.md` R8/R14) :

**1. Worker BullMQ (notifications in-app, emails, export RGPD).** L'API ne fait
qu'**enfiler** les jobs ; sans worker, rien ne les consomme (aucune notification, export
bloqué en `pending`). Lancer, en plus de l'API :

```
pnpm --filter @talent-x/api worker:dev
```

**2. MinIO (export RGPD).** L'export a besoin d'un stockage objet S3. MinIO est déjà dans
`docker-compose.yml` (console `:9001`, API `:9000`, bucket `talentx-exports` créé par le
service `minio-createbucket`), mais le **bloc S3 de `apps/api/.env` est commenté par
défaut** → le worker échoue avec `Configuration stockage objet absente : S3_ENDPOINT requis`.
Décommenter le bloc MinIO dev de `.env` (`S3_ENDPOINT=http://localhost:9000`, bucket
`talentx-exports`, clés `talentx`/`talentx-dev-secret` — défauts non secrets du Compose),
puis redémarrer **API et worker**.

### Pièges connus

- **Bundle Metro obsolète après rebuild de `@talent-x/api-client`** : Metro sert un bundle
  en cache même si `dist/` est frais (symptôme vu : crash `groups.map is not a function`).
  Un `dist/` reconstruit ne suffit pas si Metro tournait déjà : **tuer le serveur web**
  (le process Metro détaché garde le port 8081) puis relancer avec
  `expo start --web --clear`.
- **Workers fantômes** : `nest start --watch` lance un **process applicatif enfant**
  distinct du watcher ; arrêter le watcher laisse l'enfant vivant. Plusieurs relances = N
  workers consommant la même file BullMQ, certains avec une vieille config → jobs en échec
  aléatoire. Avant de relancer, vérifier qu'aucun process `dist/worker` ne tourne encore
  (ex. `ps aux | grep dist/worker`, `wmic process` sous Windows) et tout tuer pour ne
  garder **qu'un seul** worker.

- **Push inactif sur un dev client périmé** (TLX-226) : `expo-notifications` est un **module
  natif** — un APK construit avant son ajout ne l'embarque pas. Le module est chargé
  **paresseusement** (`src/notifications/push-registration.ts`) : l'app démarre normalement, mais
  aucun jeton n'est enregistré et rien n'est reçu. Symptôme : `ensureDeviceRegistered` renvoie
  `unavailable`. Remède : rebuild du dev client (même famille que TLX-141 / TLX-218).
- **Push Android sans `google-services.json`** : FCM exige le fichier du projet Firebase
  (`tracknfield-5efa0`, Paramètres du projet → Général → « Télécharger google-services.json »)
  et l'entrée `googleServicesFile` dans `apps/mobile/app.json`. **Fichier hors dépôt** (identifiants
  de projet, même traitement que les autres secrets). Sans lui, `getDevicePushTokenAsync()` échoue
  et l'enregistrement retombe silencieusement en `unavailable`. Le compte de service doit par
  ailleurs porter `roles/cloudmessaging.messagesPublisher` (cf. `apps/api/.env.example`).

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

## Client API (généré)

Le client TypeScript de l'app mobile est **généré** depuis le contrat OpenAPI
(`docs/talent-x-openapi.yaml`, source de vérité) via [orval](https://orval.dev),
dans `packages/api-client` (`@talent-x/api-client`).

- Code généré : `packages/api-client/src/generated/**` — **ne pas éditer à la main**
  (ni linté ni formaté). Après évolution du contrat, régénérer :

  ```
  pnpm --filter @talent-x/api-client generate
  ```

- Toutes les requêtes passent par le mutator `customFetch`
  (`src/mutator/custom-fetch.ts`) : URL de base et en-têtes **configurables**, jamais
  en dur. Le câblage concret (URL, auth/refresh) est fait par la couche données.

## Couche données mobile (TanStack Query + auth)

`apps/mobile/src/` câble le client API généré à l'app (TLX-009, cf. TX-ARCH-001 §6.1/§8) :

- **`data/QueryProvider.tsx`** : fournit le cache [TanStack Query](https://tanstack.com/query)
  (état serveur) et initialise la couche au montage (`data/setup.ts`).
- **`auth/token-store.ts`** : jetons stockés dans le **trousseau OS** (expo-secure-store —
  Keychain/Keystore), avec cache mémoire hydraté au démarrage.
- **`auth/auth.ts`** : intercepteur d'auth — injecte `Authorization: Bearer <token>` et,
  sur `401`, rafraîchit la session (refresh **rotatif à usage unique**, single-flight ;
  `401/409` → déconnexion). Branché via le seam `refreshAuth`/`getHeaders` du client.

**Configuration** : l'URL de l'API vient de la variable **publique** Expo
`EXPO_PUBLIC_API_URL` (URL, pas un secret — cf. `apps/mobile/.env.example`) :

```
EXPO_PUBLIC_API_URL=http://localhost:3000/api/v1
```

## Composants UI (design system)

Bibliothèque de composants de base (TLX-006) dans `apps/mobile/src/components/ui`,
entièrement dérivée des tokens (`@talent-x/design-tokens`, `useTheme()`) — aucune
valeur en dur :

| Composant | Rôle                                                                               |
| --------- | ---------------------------------------------------------------------------------- |
| `Button`  | variantes primary/secondary/ghost/danger, tailles sm/md/lg, états loading/disabled |
| `Input`   | champ texte (label, erreur, focus), relaie les props de `TextInput`                |
| `Card`    | surface + bordure + élévation ; pressable optionnel                                |
| `Chip`    | filtre sélectionnable (pill)                                                       |
| `Slider`  | curseur au geste (ex. RPE 1..10), accessible (adjustable)                          |
| `TabBar`  | barre d'onglets de bas d'écran, présentationnelle                                  |

```tsx
import { Button, Input, Card } from '@/src/components/ui';
```

## Travailler avec Claude Code

Voir `CLAUDE.md` (carte du projet) et `CURRENT_SPRINT.md` (cycle en cours).
