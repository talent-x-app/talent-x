# Sprint courant : Pilotage coach — couche données + dérivations (backend ✅)

Objectif : construire la **fondation données** du volet coach (séances → affectations →
performances) puis les **dérivations** (`/coach/dashboard`, `/athletes/{id}/stats`), afin
de débloquer les écrans coach C-01/C-02/C-03.

> Ordre choisi : **construire la couche d'abord** (dépendances honnêtes). TLX-080
> dépendait de TLX-070 + TLX-051, eux-mêmes de TLX-050 — tous étaient des stubs `501`.

## À faire (frontend)

- **TLX-082/083** Sections « À revoir » / « Aujourd'hui » (enfants de C-01) — listes
  détaillées au-delà des KPIs livrés.
- **TLX-084/085** Alertes détaillées & états première utilisation (enfants de C-01).
- **TLX-052** Constructeur de séance (C-05) [PARENT] + éditeurs de blocs (TLX-053…).
- **TLX-086** Revue de performance + feedback (C-08) — pose le commentaire coach qui sort
  une perf de « à revoir ».

## En cours

- _(rien — backend du sprint terminé)_

## Terminés ce sprint (backend)

- **TLX-050** (API) Séances — **8 endpoints** : CRUD `/sessions` (create/list/get/update/
  delete soft) + `duplicate` + `archive`. Blocs typés JSONB (`ExercisesDoc`), list role-aware
  (coach = siennes / athlète = affectées), ownership via `assertSessionOwnedByCoach`.
  16 tests. **Validé réel (DB)** 14/14. Commit `bfba0ee`.
- **TLX-051** (API) Affectations — `POST /sessions/:id/assign` (coach → athlètes liés,
  idempotent via `ux_assignment_active`) + `GET /assignments` (role-aware) + `GET
/assignments/:id`. En-tête `Idempotency-Key` requis. 13 tests. **Validé réel** 12/12.
  Commits `5573610`, `b1db7f0`.
- **TLX-070** (API) Performances — `POST/GET/PUT /assignments/:id/performance`. 1:1 avec
  l'affectation, idempotent (unicité `assignment_id`), consent-gated (`data_processing` à
  la saisie, `coach_access` à la lecture coach), soumission → affectation `completed`.
  12 tests. **Validé réel** 10/10. Commit `bc7f85e`.
- **TLX-080** (API) Dérivations pilotage coach — `GET /coach/dashboard` (athlètes liés +
  statuts dérivés `late`/`pending_review`/`up_to_date`, KPIs `toReview`/`today`, alertes
  `missedSessions`/`consentMissing`) + `GET /athletes/:id/stats` (consent-gated).
  11 tests. **Validé réel** (dashboard + stats 7/7). Commit `782de28`. **Débloque C-02/C-03.**

Total : **+52 tests API** (168 → 220). Tout poussé sur `main`.

## Terminés ce sprint (frontend + contrat)

- **ADR-17** Contrat explicite des dérivations (`Dashboard`/`Stats`) — l'OpenAPI était
  volontairement lâche (`additionalProperties`) ; figé pour décrire le payload TLX-080.
  Client `@talent-x/api-client` régénéré (orval) → typé de bout en bout. Commit `0a7df7c`.
- **TLX-081** (UI) Tableau de bord coach (C-01) — `app/(coach)/index.tsx` branché sur
  `GET /coach/dashboard` : KPIs (à revoir/aujourd'hui), bandeau d'alertes (retards,
  consentements manquants), liste « Tes athlètes » + badge de statut dérivé, états
  chargement/erreur/vide, pull-to-refresh. 6 tests ; **suite mobile 88/88**. Commit `65ef052`.
  Linear **TLX-61 Done** (vue principale ; sous-sections = TLX-082/083/084/085).
- **TLX-044** (UI) Écran Athlètes (C-02) — onglet `(coach)/athletes` : liste des athlètes
  liés via `/coach/dashboard` (cache partagé avec C-01), statut dérivé, lignes cliquables.
  Composants partagés extraits (`src/coach/athlete-ui.tsx`). Linear **TLX-33 Done**. `f013994`.
- **TLX-045** (UI) Détail athlète (C-03) — route `(coach)/athlete/[id]` (hors tab bar) :
  identité (params) + stats `/athletes/:id/stats`, consent-gated (403 → message dédié).
  Linear **TLX-34 Done**. `788b5d1`. **Suite mobile 98/98**. Validé en réel (Expo web) :
  liste, message consentement (Lea), stats peuplées (Tom 1/1, 100 %, RPE 7).

## Notes / dépendances (réutilisables)

- **Mapper séance partagé** : `sessions/session.mapper.ts` (`toSessionDto`).
- **Idempotence sans key-store** : assurée structurellement par les index uniques partiels
  (`ux_assignment_active`, `performances.assignment_id`) — l'en-tête `Idempotency-Key` est
  exigé côté contrat (400 si absent) mais l'effet idempotent vient des clés naturelles.
- **« À revoir »** = perf soumise **sans commentaire du coach** (la revue = TLX-086).
- **« Réalisée »** = affectation `completed`, posée à la soumission de la perf (TLX-070).
- **Portes consentement** (rappel) : `data_processing` (saisie perf athlète),
  `coach_access` (lecture perf + stats côté coach), en plus du lien coach↔athlète actif.
- Base dev : `docker compose up -d` → `prisma migrate deploy` → seed. Port Postgres **5433**.
- Validation réelle : register coach/athlète → join groupe (crée le lien) → assign → perf.
  L'API `pnpm start` sert un `dist/` figé ; pour tester du code frais lancer
  `PORT=3001 nest start` (clé RS256 éphémère → re-login après redémarrage).

## Jalons

- **S-00 Fondations** : ✅ 15/15.
- **S-01 Auth & RGPD** : ✅ clos.
- **S-02 Profils & Groupes** : ✅ clos (TLX-040/041/042/043).
- **Pilotage coach (backend)** : ✅ TLX-050/051/070/080. Reste le frontend
  (C-01/C-02/C-03, constructeur de séance, revue C-08).

## Prochaine étape (proposition)

Frontend coach : **TLX-081** (tableau de bord C-01) en s'appuyant sur `/coach/dashboard`,
puis **TLX-044/045** (C-02/C-03) désormais débloqués. Alternative : **TLX-052**
(constructeur de séance C-05) pour compléter le cycle de création côté coach.
