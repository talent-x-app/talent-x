# Sprint courant : S-01 — Auth & RGPD

Objectif de fin de cycle : un utilisateur s'inscrit, se connecte (JWT RS256 +
refresh rotatif), son rôle/ownership est appliqué, et le socle RGPD
(consentement, export, effacement) est en place.

## À faire

- **TLX-034** DELETE /users/:id — effacement + anonymisation — ✅ **débloqué** (worker TLX-035 livré).
  Soft-delete immédiat (`deleted_at`, révocation sessions) + 202 ; purge/anonymisation planifiée
  (ADR-13 §2). Dernier ticket du sprint.

## En cours

- _(rien)_

## Terminés ce sprint

- **TLX-033** Export RGPD — **endpoints + contenu réel livrés**. `POST /users/me/export` (202,
  idempotent sur l'export actif) et `GET /users/me/export/{jobId}` (URL présignée au GET, 404
  hors-propriétaire, 400 jobId malformé) ; `ExportService` + `ExportJobDto`/`JobDto`.
  Vrai `DataExportArchiveBuilder` câblé dans le worker — manifeste par rôle, **sans secrets ni
  données de tiers**, acté en **ADR-14** (feedbacks reçus exclus ; identités d'athlètes exclues de
  l'export coach). Audit `data.export` écrit à la demande. Tests API 129/129. **Validé bout en bout**
  (register → POST → worker → builder réel → GET) : le builder produit l'archive ; seul le dépôt S3
  manque (→ **TLX-82**). Câblage RGPD du `ConsentGate` non requis sur ces routes (droit d'accès).
- **TLX-035** Infra jobs asynchrones — **socle + couche worker livrés**. Socle data model
  `export_jobs` (PR #10, ADR-13) appliqué en base réelle. Couche worker : file BullMQ
  `data-export` + producteur `ExportQueueService` ; **process worker séparé** (`src/worker.ts`,
  TX-ARCH-001 §4.5) consommant la file via `ExportProcessor` (transitions
  `pending→processing→ready|failed`) ; `ObjectStorageService` S3 OVH (put / URL présignée au
  GET / delete) ; nettoyage planifié des archives expirées (`ExportCleanupService`, `@Cron`,
  worker only) ; point d'extension `ExportArchiveBuilder` (placeholder → contenu réel en TLX-033) ;
  check Redis dans la readiness ; config S3/Redis/TTL dans `validateEnv`. Tests API 121/121.
  **Plomberie validée bout en bout** (Redis Docker) : enqueue → worker → DB (`failed` placeholder).
  Reste à valider en réel le chemin **S3** (put / URL présignée / cleanup) → **TLX-82**.
- **TLX-020** Génération et rotation des clés RS256 (keystore) — PR #9 mergée
- **TLX-021** POST /auth/register — Argon2id + émission access/refresh — mergé
- **TLX-022** POST /auth/login + JwtAuthGuard global (routes protégées → 401) — mergé
- **TLX-023** POST /auth/refresh — rotation + détection de réutilisation (révocation famille) — mergé
- **TLX-024** Middleware RBAC + ownership — `RolesGuard` global + `OwnershipService` (appartenance coach↔athlète, ownership séance/groupe/compte) — mergé
- **TLX-031** GET/PUT /users/me/consents — consentement append-only + versionnage (`CONSENT_TEXT_VERSION`) — mergé
- **TLX-032** Gating `CONSENT_REQUIRED` — `ConsentGate` (4ᵉ niveau d'autorisation, RB-08), réutilisable pour perfs/stats — mergé
- **TLX-025** Écran Connexion (O-02) — login + persistance jetons + session + navigation, états gérés, tests — mergé
- **TLX-026** Écrans Inscription + choix du rôle (O-03/O-04) — `register` + `RoleCard`, mêmes flux/états que login (409 e-mail pris, 422 validation), tests (6/6) — mergé
- **TLX-030** Écran Consentement (O-05) — onboarding RGPD opt-in (sans case pré-cochée), `PUT /users/me/consents` par choix, flux register → consent → tabs (`signIn` différé), tests (4/4) — mergé
- **TLX-027** Persistance de session + refresh silencieux — `restoreSession` (refresh silencieux au démarrage, présence des jetons = source de vérité : échec dur → logout, erreur réseau → reprise optimiste) ; `SessionProvider` propriétaire unique du bootstrap ; `QueryProvider` n'init. plus la couche données (corrige une race sur le cache de jetons). Tests (suite mobile 77/77) — mergé

## Notes / dépendances

- Cœur auth backend en place : `PasswordService` (Argon2id), `TokenService`
  (access RS256 + refresh opaque rotatif), `JwtAuthGuard` global. Réutilisables
  pour la suite (RBAC, consentement…).
- **TLX-79** : chemins nominaux register/login/refresh, requêtes
  d'ownership/appartenance (`OwnershipService`, TLX-024) **et consentements**
  (`ConsentsService` append-only, TLX-031) validés en unitaire seulement
  (Prisma mocké) — validation en base réelle (Docker) suivie là-bas.
  _Maj 2026-06-09_ : le **schéma** est désormais déployé sur base réelle
  (migrations appliquées + seed), mais les **endpoints** n'ont pas encore été
  exercés contre cette base — la validation fonctionnelle bout en bout reste due.
- **TLX-81** (nouveau) : pendant **frontend** de TLX-79. Les écrans onboarding
  (login O-02, inscription O-03/O-04, consentement O-05) et le flux
  `register → consent → tabs` sont validés en Jest seulement (client/router/
  session mockés) — jamais exécutés sur app Expo réelle contre une API live.
- **Autorisation prête à câbler** : `@Roles('coach'|'athlete')` appliqué
  globalement ; les services métier injectent `OwnershipService` (appartenance/
  propriété) et `ConsentGate` (`assertActiveConsent` → 403 `CONSENT_REQUIRED`).
  Les contrôleurs perfs/stats ne sont pas encore scaffoldés (TLX-070, TLX-040/080) :
  le gating sera branché à leur livraison. Câblage par ticket de ressource.
- **TLX-035** (Linear TLX-80) : export/effacement RGPD (TLX-033/034) sont des
  opérations **asynchrones** (202 + ressource `Job`). Décision tranchée par
  **ADR-13** (raffine ADR-09) : table `export_jobs` pour l'export (état persistant),
  suppression conservée sur soft-delete + purge planifiée (pas de table de jobs).
  Socle data model + migration **mergé (PR #10)** et **appliqué sur base réelle**
  (Docker, 2026-06-09 : migrations `init` + `export_jobs` déployées, table vérifiée —
  CHECK statut, index unique partiel « un seul export actif », FK CASCADE, trigger
  `updated_at` ; seed OK). Reste worker BullMQ/Redis + stockage OVH S3 + URL présignée
  avant de livrer les endpoints. Pose en bloqueur de TLX-033 et TLX-034 dans Linear.
- **Front auth** : `login.tsx`, `register.tsx` (TLX-026) et `consent.tsx` (TLX-030)
  livrés. Onboarding : register → consent → tabs (la session n'est ouverte
  qu'après l'étape consentement). Persistance/restauration de session au
  démarrage + refresh silencieux (TLX-027) : `SessionProvider` → `setupApiClient`
  puis `restoreSession`. Intercepteur refresh single-flight réactif (TLX-009).
- Base dev : `docker compose up -d` puis `prisma migrate deploy` puis `pnpm --filter @talent-x/api seed`.
- Workflow distant : push direct sur `main` (commits poussés directement, sans PR).

## Jalon précédent — S-00 Fondations : ✅ 15/15 (clos)

TLX-001 → 015 tous mergés : mono-repo, design system et composants UI, navigation,
client API généré et couche données, squelette API avec logs/readiness, schéma
Prisma avec migration et seed, CI, qualité (ESLint/Prettier/Husky),
environnements/secrets, harnais de tests, gestion erreurs/toasts/offline.
