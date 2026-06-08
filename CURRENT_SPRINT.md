# Sprint courant : S-01 — Auth & RGPD

Objectif de fin de cycle : un utilisateur s'inscrit, se connecte (JWT RS256 +
refresh rotatif), son rôle/ownership est appliqué, et le socle RGPD
(consentement, export, effacement) est en place.

## À faire

- **TLX-021** POST /auth/register — inscription + choix du rôle
- **TLX-022** POST /auth/login — JWT access + refresh (enregistrer le `JwtAuthGuard` global)
- **TLX-023** POST /auth/refresh — rotation du refresh token + détection de réutilisation
- **TLX-024** Middleware RBAC + ownership (coach/athlète/groupe)
- **TLX-025** Écran Connexion (O-02)
- **TLX-026** Écrans Inscription + choix du rôle (O-03, O-04)
- **TLX-027** Persistance de session + refresh silencieux (app)
- **TLX-030** Écran Consentement (O-05, case non pré-cochée)
- **TLX-031** POST /consents + versionnage du consentement
- **TLX-032** Gating API CONSENT_REQUIRED (données de santé)
- **TLX-033** GET /users/:id/data-export — export RGPD
- **TLX-034** DELETE /users/:id — effacement + anonymisation

## En cours

- _(rien)_

## Terminés ce sprint

- **TLX-020** Génération et rotation des clés RS256 (keystore) — PR #9 mergée

## Notes / dépendances

- Clés JWT RS256 disponibles (TLX-020) : `pnpm --filter @talent-x/api keys:generate` ;
  config via `src/auth/keys/`. Le `JwtAuthGuard` (TLX-011) reste à enregistrer
  globalement lors de TLX-022/024.
- Base dev : `docker compose up -d` puis `prisma migrate deploy` puis `pnpm --filter @talent-x/api seed`.
- Workflow distant : pousser sur une branche `claude/*` + PR (le push direct sur `main` échoue à distance).

## Jalon précédent — S-00 Fondations : ✅ 15/15 (clos)

TLX-001 → 015 tous mergés : mono-repo, design system + composants UI, navigation,
client API généré + couche données, squelette API + logs/readiness, schéma Prisma

- migration + seed, CI, qualité (ESLint/Prettier/Husky), environnements/secrets,
  harnais de tests, gestion erreurs/toasts/offline.
