# Sprint courant : S-01 — Auth & RGPD

Objectif de fin de cycle : un utilisateur s'inscrit, se connecte (JWT RS256 +
refresh rotatif), son rôle/ownership est appliqué, et le socle RGPD
(consentement, export, effacement) est en place.

## À faire

- **TLX-027** Persistance de session + refresh silencieux (app)
- **TLX-033** GET /users/:id/data-export — export RGPD — ⛔ bloqué par **TLX-80**
- **TLX-034** DELETE /users/:id — effacement + anonymisation — ⛔ bloqué par **TLX-80**

## En cours

- _(rien)_

## Terminés ce sprint

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

## Notes / dépendances

- Cœur auth backend en place : `PasswordService` (Argon2id), `TokenService`
  (access RS256 + refresh opaque rotatif), `JwtAuthGuard` global. Réutilisables
  pour la suite (RBAC, consentement…).
- **TLX-79** : chemins nominaux register/login/refresh, requêtes
  d'ownership/appartenance (`OwnershipService`, TLX-024) **et consentements**
  (`ConsentsService` append-only, TLX-031) validés en unitaire seulement
  (Prisma mocké) — validation en base réelle (Docker) suivie là-bas.
- **TLX-81** (nouveau) : pendant **frontend** de TLX-79. Les écrans onboarding
  (login O-02, inscription O-03/O-04, consentement O-05) et le flux
  `register → consent → tabs` sont validés en Jest seulement (client/router/
  session mockés) — jamais exécutés sur app Expo réelle contre une API live.
- **Autorisation prête à câbler** : `@Roles('coach'|'athlete')` appliqué
  globalement ; les services métier injectent `OwnershipService` (appartenance/
  propriété) et `ConsentGate` (`assertActiveConsent` → 403 `CONSENT_REQUIRED`).
  Les contrôleurs perfs/stats ne sont pas encore scaffoldés (TLX-070, TLX-040/080) :
  le gating sera branché à leur livraison. Câblage par ticket de ressource.
- **TLX-80** (nouveau) : export/effacement RGPD (TLX-033/034) sont des opérations
  **asynchrones** (202 + ressource `Job`). Bloqués : pas de worker (BullMQ/Redis)
  ni de table de jobs au modèle de données. Décision d'archi requise (table
  `data_jobs` + worker) avant de livrer les endpoints.
- **Front auth** : `login.tsx`, `register.tsx` (TLX-026) et `consent.tsx` (TLX-030)
  livrés. Onboarding : register → consent → tabs (la session n'est ouverte
  qu'après l'étape consentement). Infra session déjà en place (token-store
  trousseau, SessionProvider, intercepteur refresh single-flight de TLX-009).
- Base dev : `docker compose up -d` puis `prisma migrate deploy` puis `pnpm --filter @talent-x/api seed`.
- Workflow distant : push direct sur `main` (commits poussés directement, sans PR).

## Jalon précédent — S-00 Fondations : ✅ 15/15 (clos)

TLX-001 → 015 tous mergés : mono-repo, design system et composants UI, navigation,
client API généré et couche données, squelette API avec logs/readiness, schéma
Prisma avec migration et seed, CI, qualité (ESLint/Prettier/Husky),
environnements/secrets, harnais de tests, gestion erreurs/toasts/offline.
