# Sprint courant : S-02 — Profils & Groupes ✅ clos

Objectif atteint : profil consultable/éditable (coach & athlète) et gestion
complète des groupes côté API. Milestone Linear **Profils & Groupes** à 100 %.

> Les 2 écrans coach **C-02 (liste athlètes)** et **C-03 (détail + stats)** ont été
> **sortis du périmètre** : ils dépendent de dérivations non encore livrées
> (`/coach/dashboard`, `/athletes/{id}/stats` → **TLX-080**). Déplacés vers le
> milestone **Pilotage coach** et marqués **bloqués par TLX-080** dans Linear.

## À faire

- _(rien — prochain sprint à ouvrir)_

## En cours

- _(rien)_

## Terminés ce sprint

- **TLX-040** (API) Profil — `GET/PUT /users/me` (`getMe`/`updateMe`). Conforme au
  contrat (`/users/me`, pas `/athletes/{id}` — le titre était un raccourci).
  `ProfileService` (404 si supprimé), `UserUpdateDto` (PATCH). Tests 151/151 à la livraison.
- **TLX-041** (API) Groupes + membres — **10 endpoints** : CRUD groupes (soft-delete),
  membres (liste paginée, retrait), `manageInviteCode` (regenerate/revoke), `joinGroup`
  (code valide, idempotent), `leaveGroup`. RBAC + ownership ; lien `coach_athlete_links`
  géré au niveau coach↔athlète. **ADR-16** (révocation via `invite_code_revoked_at`).
  Tests API 168/168. Validé en réel (cycle join→lien créé / leave→lien terminé).
- **TLX-042** (UI) Profil athlète (A-10) — composant **réutilisable** `ProfileScreen`
  (lecture/édition `/users/me`, états chargement/erreur/édition/succès, déconnexion).
  100 % design system. **Validé en réel sur Expo web** (login → édition → persistance
  base → toast).
- **TLX-043** (UI) Profil coach (C-11) — route `(coach)/profile.tsx` branchée sur
  `ProfileScreen` (libellé « Coach »). Tests mobile 82/82.

## Reporté → milestone « Pilotage coach » (bloqué par TLX-080)

- **TLX-044** (UI) Écran Athlètes (C-02) — liste des athlètes du coach. Pas de source
  « tous mes athlètes » au contrat hors `/coach/dashboard` (TLX-080) ; les membres de
  groupe seuls sont incomplets (athlètes liés en `direct` exclus).
- **TLX-045** (UI) Détail athlète (C-03) — affiche les stats via `/athletes/{id}/stats`
  (stub `NotImplementedException`, logique = TLX-080, consent-gated).

## Notes / dépendances (réutilisables)

- **Socle autorisation (S-01).** `JwtAuthGuard` + `RolesGuard` globaux, `@Roles`,
  `OwnershipService` (appartenance + ownership groupe/séance/compte), `ConsentGate`
  (`assertActiveConsent` → 403 `CONSENT_REQUIRED`).
- **Règle consentement.** Rejoindre un groupe = **code valide** (matrice §6) ; le
  consentement `coach_access` gate les **perfs/stats** (TLX-070/080), pas l'appartenance.
- **Pagination commune** : `src/common/pagination/` (`PaginationQueryDto`, `buildPageMeta`,
  `parseSort`) — réutilisable par les prochains endpoints paginés.
- **`ProfileScreen`** (`apps/mobile/src/profile/`) : écran profil partagé, role-aware.
- Base dev : `docker compose up -d` → `prisma migrate deploy` → `pnpm --filter @talent-x/api seed`.
- Workflow distant : push direct sur `main` (sans PR).

## Jalons

- **S-00 Fondations** : ✅ 15/15 (clos).
- **S-01 Auth & RGPD** : ✅ clos (auth JWT, RBAC/ownership/consentement, RGPD export/
  effacement, observabilité file `/metrics`). Validé en réel.
- **S-02 Profils & Groupes** : ✅ clos — TLX-040/041/042/043. C-02/C-03 reportés
  (bloqués par TLX-080).

## Prochain sprint (proposition)

Milestone suivant = **Sessions** (séances) : `POST/GET /sessions` (TLX-050),
`POST /assignments` (TLX-051) puis constructeur de séance + éditeurs de blocs.
Alternative : **Pilotage coach** (TLX-080 dérivations → débloque C-02/C-03 + dashboard).
