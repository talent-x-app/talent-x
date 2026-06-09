# Sprint courant : S-02 — Profils & Groupes

Objectif de fin de cycle : un coach et un athlète consultent et éditent leur
profil ; un coach crée des groupes, y ajoute/retire des athlètes, et navigue
entre sa liste d'athlètes et le détail d'un athlète lié.

Milestone Linear : **Profils & Groupes** (suite de Auth & RGPD, 100 % clos).

## À faire

- **TLX-043** (UI) Écran Profil coach (C-11) — lecture/édition via `/users/me`.
  **Quasi prêt** : composant `ProfileScreen` partagé déjà livré (TLX-042) ; reste à
  brancher la route `(coach)/profile.tsx` dessus (+ éventuels libellés coach).
- **TLX-044** (UI) Écran Athlètes (C-02) — liste des athlètes du coach.
- **TLX-045** (UI) Écran Détail athlète (C-03) — profil + stats d'un athlète lié.

## En cours

- _(rien)_

## Terminés ce sprint

- **TLX-042** (UI) Écran Profil athlète (A-10) — **livré**. Composant **réutilisable**
  `src/profile/ProfileScreen.tsx` (lecture `GET /users/me` + édition `PUT /users/me` :
  prénom/nom/discipline/bio, trim, sémantique PATCH), branché sur l'onglet
  `(athlete)/profile.tsx`. États : chargement (spinner), erreur (+ réessai), édition
  (chargement/erreur via toast), succès (toast + retour lecture) ; déconnexion. 100 %
  design system (tokens, `Card`/`Button`/`Input`). Pensé pour servir aussi C-11
  (TLX-043). Tests mobile **81/81** (+4). **Validé en réel** sur **Expo web** contre
  l'API live : login → onglet Profil (avatar/identité/rôle·discipline/e-mail/bio) →
  édition (discipline+bio) → **persistance confirmée en base** (`GET /users/me`) +
  toast « Profil mis à jour ».
- **TLX-041** (API) Groupes + membres — **10 endpoints livrés** conformes au contrat :
  `createGroup` (201, code d'invitation CSPRNG unique), `listGroups`/`listGroupMembers`
  (paginés + tri), `getGroup`/`updateGroup` (PATCH), `deleteGroup` (soft + clôture
  appartenances/liens), `removeGroupMember`, `manageInviteCode` (regenerate/revoke),
  `joinGroup` (200, code valide, idempotent), `leaveGroup` (204). RBAC par endpoint
  (coach hors join/leave ; athlète pour join/leave) + ownership via `OwnershipService`.
  **Lien `coach_athlete_links`** géré au niveau coach↔athlète (source `group`) : créé
  au 1ᵉʳ groupe, terminé au départ du **dernier** groupe du coach. **ADR-16** acté
  (révocation du code via `invite_code_revoked_at`, `invite_code` reste NOT NULL ;
  migration `20260609130000_group_invite_revoked` appliquée). Tests API **168/168**
  (+17). **Validé en réel** (DB Docker) : create → join (200, **lien créé=1**) →
  membres → leave (204, **lien terminé=0**) → revoke (`inviteCode:null`) → join
  révoqué **404** → regenerate → RBAC **403** (athlète crée / coach join) → ownership
  **403** (groupe d'autrui) → delete **204** → GET **404** → name vide **422**.
- **TLX-040** (API) Profil — **`GET/PUT /users/me` livrés** (`getMe`/`updateMe`,
  remplacent les stubs `NotImplementedException`). `ProfileService` : `getMe`
  (projection `users` → DTO `User`, **404** si introuvable/soft-deleted) ;
  `updateMe` (sémantique **PATCH** — seuls les champs fournis écrits ; `email`/
  `role` non modifiables ; 404 si supprimé). `UserUpdateDto` (schéma `UserUpdate` :
  firstName/lastName/photoUrl(uri)/sport/bio, tous optionnels, `MaxLength`).
  **Conforme au contrat OpenAPI** (`/users/me`, pas `/athletes/{id}` — voir note
  divergence). Tests API **151/151** (+6). **Validé en réel** (DB Docker) :
  register → GET (profil) → PUT (sport+bio, `updatedAt` incrémenté) → re-GET
  (persisté) → champ inconnu **422** (whitelist) → sans token **401**.

## Notes / dépendances

- **Divergence titre ↔ contrat (TLX-040, règle 7).** Le titre Linear dit
  « GET/PATCH /athletes/:id » mais le **contrat OpenAPI** (source de vérité) n'a
  **pas** cette route. Le profil y est `/users/me` (GET/PUT — `getMe`/`updateMe`,
  schémas `User`/`UserUpdate`) ; l'accès coach→athlète est `/athletes/{id}/stats`
  (stats, **consent-gated**, hors périmètre profil → relève de la Progression).
  Le corps du ticket dit « conforme au contrat OpenAPI » : **le contrat prime**,
  le titre est un raccourci. On implémente donc `/users/me`, **sans** créer
  `/athletes/{id}` (pas d'ADR : on suit le contrat, on ne le complète pas).
  L'écran C-03 (TLX-045) composera le « détail athlète » à partir de
  `/athletes/{id}/stats` + résumé d'appartenance (UserSummary), pas d'un GET profil.
- **Socle réutilisable (S-01).** `JwtAuthGuard` + `RolesGuard` globaux,
  `@Roles('coach'|'athlete')`, `OwnershipService` (appartenance coach↔athlète,
  ownership groupe/séance/compte), `ConsentGate` (`assertActiveConsent` → 403
  `CONSENT_REQUIRED`).
- **Règle consentement (clarifiée sur TLX-041).** Rejoindre un groupe est autorisé
  par un **code d'invitation valide** (matrice §6) ; le consentement `coach_access`
  ne gate **pas** l'appartenance mais l'accès du coach aux **perfs/stats** (lignes
  201/345 — `ConsentGate` à câbler sur TLX-070/080, pas sur les groupes). Le lien
  coach↔athlète (`source='group'`) se crée au join.
- **Stubs de contrat (TLX-011).** Contrôleurs `groups`/`sessions`/… déjà
  scaffoldés (routes câblées, handlers `NotImplementedException`) — à remplir.
  `users.controller` : `getMe`/`updateMe` étaient des stubs (TLX-040 les remplit).
- **Modèle de données.** `User` (Prisma) : `firstName`/`lastName` requis, `sport`,
  `bio`, `photoUrl`, `birthDate` optionnels ; soft-delete `deletedAt`. `Group`
  (`GroupCoach`), `GroupMember`, `CoachAthleteLink` déjà au schéma.
- Base dev : `docker compose up -d` puis `prisma migrate deploy` puis `pnpm --filter @talent-x/api seed`.
- Workflow distant : push direct sur `main` (sans PR).

## Jalons précédents

- **S-00 Fondations** : ✅ 15/15 (clos).
- **S-01 Auth & RGPD** : ✅ clos. Auth JWT RS256 + refresh rotatif, RBAC +
  ownership + consentement, RGPD (consentement versionné, export asynchrone S3,
  effacement + purge planifiée), observabilité file de jobs (`/metrics`,
  TLX-83). Validé en réel (DB Docker, Redis, S3 MinIO, app Expo réelle).
