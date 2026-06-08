# Sprint courant : S-01 — Auth & RGPD

Objectif de fin de cycle : un utilisateur s'inscrit, se connecte (JWT RS256 +
refresh rotatif), son rôle/ownership est appliqué, et le socle RGPD
(consentement, export, effacement) est en place.

## À faire

- **TLX-025** Écran Connexion (O-02)
- **TLX-026** Écrans Inscription + choix du rôle (O-03, O-04)
- **TLX-027** Persistance de session + refresh silencieux (app)
- **TLX-030** Écran Consentement (O-05, case non pré-cochée)
- **TLX-032** Gating API CONSENT_REQUIRED (données de santé)
- **TLX-033** GET /users/:id/data-export — export RGPD
- **TLX-034** DELETE /users/:id — effacement + anonymisation

## En cours

- _(rien)_

## Terminés ce sprint

- **TLX-020** Génération et rotation des clés RS256 (keystore) — PR #9 mergée
- **TLX-021** POST /auth/register — Argon2id + émission access/refresh — mergé
- **TLX-022** POST /auth/login + JwtAuthGuard global (routes protégées → 401) — mergé
- **TLX-023** POST /auth/refresh — rotation + détection de réutilisation (révocation famille) — mergé
- **TLX-024** Middleware RBAC + ownership — `RolesGuard` global + `OwnershipService` (appartenance coach↔athlète, ownership séance/groupe/compte) — mergé
- **TLX-031** GET/PUT /users/me/consents — consentement append-only + versionnage (`CONSENT_TEXT_VERSION`) — mergé

## Notes / dépendances

- Cœur auth backend en place : `PasswordService` (Argon2id), `TokenService`
  (access RS256 + refresh opaque rotatif), `JwtAuthGuard` global. Réutilisables
  pour la suite (RBAC, consentement…).
- **TLX-79** : chemins nominaux register/login/refresh, requêtes
  d'ownership/appartenance (`OwnershipService`, TLX-024) **et consentements**
  (`ConsentsService` append-only, TLX-031) validés en unitaire seulement
  (Prisma mocké) — validation en base réelle (Docker) suivie là-bas.
- **RBAC/ownership prêts à câbler** : `@Roles('coach'|'athlete')` est désormais
  appliqué globalement ; les services métier injectent `OwnershipService` pour
  l'appartenance et la propriété. Les contrôleurs restent des squelettes (501) —
  câblage par ticket de ressource (sessions, groupes, perfs…).
- Base dev : `docker compose up -d` puis `prisma migrate deploy` puis `pnpm --filter @talent-x/api seed`.
- Workflow distant : pousser sur une branche `claude/*` + PR (le push direct sur `main` échoue à distance).

## Jalon précédent — S-00 Fondations : ✅ 15/15 (clos)

TLX-001 → 015 tous mergés : mono-repo, design system et composants UI, navigation,
client API généré et couche données, squelette API avec logs/readiness, schéma
Prisma avec migration et seed, CI, qualité (ESLint/Prettier/Husky),
environnements/secrets, harnais de tests, gestion erreurs/toasts/offline.
