# Sprint courant : Pilotage coach — couche données + dérivations (backend ✅)

Objectif : construire la **fondation données** du volet coach (séances → affectations →
performances) puis les **dérivations** (`/coach/dashboard`, `/athletes/{id}/stats`), afin
de débloquer les écrans coach C-01/C-02/C-03.

> Ordre choisi : **construire la couche d'abord** (dépendances honnêtes). TLX-080
> dépendait de TLX-070 + TLX-051, eux-mêmes de TLX-050 — tous étaient des stubs `501`.

## À faire (frontend)

- **TLX-053→061** Sélecteur de type de bloc + 8 éditeurs typés par discipline
  (C-05 §6). **Débloqués** : ADR-18 accepté + cadre contrat v2 livré (`type`/`params`).
  Chaque éditeur fixe la forme de son `params` à son tour.
- **TLX-062** Cibles de bloc → pré-remplissage saisie perf (A-04) — débloqué par le v2.
- **TLX-063** Écran Assignation (C-06) + Confirmation (C-07) — débloqué par TLX-052.
- **TLX-082/083** Sections « À revoir » / « Aujourd'hui » (enfants de C-01) — listes
  détaillées au-delà des KPIs livrés.
- **TLX-084/085** Alertes détaillées & états première utilisation (enfants de C-01).

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

## Terminés ce sprint — C-05 Constructeur de séance (TLX-052)

- **(UI) Écran constructeur** — routes `(coach)/session/new` + `[id]` (édition) :
  en-tête (titre, description, date, statut Brouillon/Publiée) + canvas de blocs
  ordonnés. **Éditeur de bloc générique** calé sur le schéma exercises v1
  (name/sets/reps/durée/repos/charge `{value,unit}`/notes), réordonnancement, ajout/
  suppression. Création `POST /sessions` / édition `GET`+`PUT`. Entrée « Nouvelle séance »
  sur le dashboard coach. Composants partagés `src/coach/session-builder-ui.tsx`.
  +9 tests ; **suite mobile 127/127** ; typecheck + lint clean. Commit `02a7535`.
- **Validé en réel** (Expo web + API locale) : coach connecté → « Nouvelle séance » →
  2 blocs (Squat arrière 5×3 @80 kg, Gainage 45 s) + statut Publiée → **`POST /sessions`
  201**, payload `schemaVersion 1`, `order` 1/2, charge `{80,kg}` persistés ; retour
  dashboard. **Le coach crée ses séances dans l'app (plus de seed via API).**
- **ADR-18 (Accepté)** — schéma exercises **v2** en union discriminée (blocs typés par
  discipline). La coquille générique livrée est une variante de v2 (zéro rework).
- **Cadre contrat v2 livré** (commit `239f546`) — enum `BlockType` + `Exercise.type?` +
  `Exercise.params?` (libre), `schemaVersion` 2 par défaut, rétro-compat (bloc sans
  `type` lu en `custom`). Touche TX-DATA-006 §9.1 + OpenAPI + DTO Nest ; client orval
  régénéré ; frontend tague en v2. **+7 tests** (3 service + 4 ValidationPipe : `type`/
  `params` acceptés, type hors enum / champ inconnu rejetés). **API 241/241**, mobile
  **127/127**. `params` par discipline = fixé par chaque éditeur (TLX-054→061).

## Terminés ce sprint — A-09 Fil de feedback athlète (TLX-092)

- **Composant partagé `FeedbackThread`** (`src/comments/FeedbackThread.tsx`) — fil de
  commentaires d'une performance : `listComments` + `createComment`, états chargement /
  vide, saisie. **Une seule source de vérité** pour le dialogue, réutilisée côté coach
  (revue C-08) et athlète (A-09). `CoachReviewScreen` refactorisé pour l'utiliser.
- **(UI) Côté athlète** — le détail séance (A-03/A-04) affiche le fil sur la perf soumise :
  l'athlète **voit** le feedback du coach et peut **répondre** (titulaire autorisé en
  lecture/écriture). 4 tests composant ; suite mobile **118/118**.
- **Validé en réel** (Expo web) : Nina ouvre sa séance → voit les 2 retours du coach →
  poste « Merci coach ! … » (`POST /comments` 201, fil rafraîchi, 3 messages). **Le
  dialogue coach↔athlète est bidirectionnel et complet.**

## Terminés ce sprint — C-08 Revue de perf + feedback (TLX-086)

- **(API) Commentaires** — `POST/GET/DELETE /comments` (squelette 501 → implémenté) :
  cible **séance XOR performance** (400 sinon), autorisation « partie liée » (perf :
  athlète titulaire **ou** coach propriétaire + lien + `coach_access` ; séance : coach
  propriétaire **ou** athlète affecté), suppression réservée à l'auteur (soft-delete).
  **14 tests** (suite API **234/234**). Le modèle de données et la dérivation
  `pending_review` (perf **sans** commentaire coach) existaient déjà → un feedback coach
  fait sortir la perf de « à revoir ».
- **(UI) Écran de revue (C-08)** — route `(coach)/review/[id]` : `getPerformance`
  (consent-gated) + `listComments`, résumé perf (RPE, exercices réalisés, ressenti), fil
  de feedback, saisie → `createComment` (invalide le tableau de bord). Entrée depuis C-03
  (section « Séances réalisées »). 6 tests ; suite mobile **114/114**.
- **Validé en réel** (Expo web + API) : Nina `pending_review`/toReview 1 → le coach poste
  un feedback → commentaires 0→1 → Nina **`up_to_date`**/toReview 0 ; second feedback posté
  **via l'UI** (`POST /comments` 201, fil + dashboard rafraîchis). **Ferme la boucle de
  feedback coach→athlète.**

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
- **TLX-065** (UI) Boucle athlète — Séances (A-02) + Détail/saisie (A-03/A-04) — onglet
  `(athlete)/sessions` (liste des affectations via `GET /assignments`, statut, tri à-faire
  d'abord) + route empilée `(athlete)/session/[id]` (séance embarquée, checklist d'exercices,
  RPE slider, notes, soumission `POST /assignments/:id/performance` avec `Idempotency-Key`,
  `PUT` si déjà saisie ; porte `data_processing`). Composants partagés `src/athlete/
athlete-session-ui.tsx`. 10 tests ; **suite mobile 108/108**. **Validé en réel** (Expo web) :
  athlète Nina Koné voit sa séance « À faire », coche 3/4 exercices + RPE 7 + notes → perf
  créée (201) → côté coach l'athlète bascule **« à revoir »** (`pending_review`, `toReview: 1`)
  et l'affectation passe `completed`. **Ferme la boucle de données dans l'app** (plus de curl).
- **Fix CORS (api)** — `Idempotency-Key` ajouté à `allowedHeaders` (`main.ts`) : sans lui, le
  préflight bloquait `POST /assignments/:id/performance` et `/sessions/:id/assign` depuis tout
  client web (Expo web). Bug découvert en vérification réelle.
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

1. **TLX-053** (sélecteur de type de bloc) + premiers éditeurs typés par priorité
   (Urgent : intervalles/sprints) — chaque éditeur ajoute sa section `params` sur le
   cadre v2 désormais en place.
2. **TLX-063** (Assignation C-06 + Confirmation C-07) — débloqué par TLX-052 : assigner
   une séance créée à un·e athlète, refermant le cycle création → affectation côté coach.
