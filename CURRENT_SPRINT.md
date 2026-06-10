# Sprint courant : Pilotage coach — couche données + dérivations (backend ✅)

Objectif : construire la **fondation données** du volet coach (séances → affectations →
performances) puis les **dérivations** (`/coach/dashboard`, `/athletes/{id}/stats`), afin
de débloquer les écrans coach C-01/C-02/C-03.

> Ordre choisi : **construire la couche d'abord** (dépendances honnêtes). TLX-080
> dépendait de TLX-070 + TLX-051, eux-mêmes de TLX-050 — tous étaient des stubs `501`.

## À faire (frontend)

- _(éditeurs typés terminés — TLX-054→061 livrés ↓)_
- _(C-01 complet — TLX-081→085 livrés ↓)_

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

## Terminés ce sprint — C-05 Blocs typés : sélecteur + Intervalles (TLX-053/054)

- **TLX-053** (sélecteur de type) + **TLX-054** (éditeur Intervalles) — premier usage du
  cadre v2. Registre extensible `BLOCK_TYPE_SPECS` : chips des 11 `BlockType` + éditeur de
  `params` rendu selon le type. `interval` = `{ reps, workSeconds, recoverySeconds }`.
  Bloc `custom` byte-identique au v1. +3 tests ; **mobile 130/130** ; lint/typecheck clean.
  Commit `f880c42`. Linear **TLX-38 / TLX-39 Done**.
- **Validé en réel** (Expo web + API v2 redémarrée sur :3000) : type Intervalles →
  reps 6 / 75 s / 120 s → **`POST /sessions` 201**, persisté `{ type:"interval",
params:{reps:6, workSeconds:75, recoverySeconds:120} }`, `schemaVersion 2`. Round-trip
  UI → client orval → backend v2 → DB confirmé.

## Terminés ce sprint — C-05 Blocs typés : Sprints + Course/Endurance (TLX-055/056)

- **TLX-055** (Sprints / répétitions de vitesse) + **TLX-056** (Course continue / Tempo /
  Côtes / Fartlek) — deux nouvelles entrées `paramFields` au registre `BLOCK_TYPE_SPECS`,
  pattern TLX-054 répliqué (frontend-only, `params` libre côté backend v2). `sprint` =
  `{ reps, distanceMeters, recoverySeconds }` ; `endurance` = `{ distanceMeters,
paceSecondsPerKm, elevationMeters }`. +2 tests (payload v2 sérialisé asserté par discipline) ;
  **mobile 132/132** ; lint/typecheck clean. Linear **TLX-40 / TLX-41**.
- **Validé en réel** (Expo web, HMR) : sur `/session/new`, sélection « Sprints » → champs
  `reps`/`distanceMeters`/`recoverySeconds` ; sélection « Course / Endurance » → champs
  `distanceMeters`/`paceSecondsPerKm`/`elevationMeters`. Round-trip sérialisation identique au
  chemin Intervalles déjà validé (UI → orval → backend v2 → DB), `params` stocké en JSON libre.

## Terminés ce sprint — C-05 Blocs typés : Haies + Sauts (TLX-057/058)

- **TLX-057** (Haies) + **TLX-058** (Sauts) — deux entrées `paramFields` au registre
  `BLOCK_TYPE_SPECS` (pattern TLX-054, frontend-only, `params` libre côté backend v2).
  Premiers params **décimaux** (`kind: 'number'`) : `hurdles` = `{ heightCm, spacingMeters,
rhythmSteps }` (hauteur/espacement décimaux) ; `jumps` = `{ approachMeters, fullJumps,
plyoContacts }` (élan décimal). +2 tests (payload v2 sérialisé asserté, dont décimaux) ;
  **mobile 134/134** ; lint/typecheck clean. Linear **TLX-42 / TLX-43**.
- **Validé en réel** (Expo web, HMR) : sur `/session/new`, « Haies » → champs
  `heightCm`/`spacingMeters`/`rhythmSteps` ; « Sauts » → `approachMeters`/`fullJumps`/
  `plyoContacts`. Sérialisation identique au chemin Intervalles déjà validé end-to-end.

## Terminés ce sprint — C-05 Blocs typés : Lancers + Musculation + Circuit (TLX-059/060/061)

- **TLX-059** (Lancers) + **TLX-060** (Musculation) + **TLX-061** (Gainage / Circuit /
  Échauffement / Retour au calme) — **clôt la série des éditeurs typés** (TLX-054→061).
  `throws` = `{ implementKg (décimal), techniqueThrows, fullThrows }` ; `strength` (TLX-060) =
  **base v1 générique, aucun `params`** (le type ne fait que tagger le bloc) ; `core`/`warmup`/
  `cooldown` (TLX-061) partagent `CIRCUIT_PARAM_FIELDS` = `{ rounds, stationSeconds }` (la durée
  totale reste sur le champ de base `durationSeconds`). +3 tests (dont non-régression « pas de
  params » pour `strength`) ; **mobile 137/137** ; lint/typecheck clean. Linear **TLX-44/45/46**.
- **Validé en réel** (Expo web, HMR) : « Lancers » → `implementKg`/`techniqueThrows`/`fullThrows` ;
  « Musculation » → **aucune section params** (base v1) ; « Gainage / Circuit » → `rounds`/
  `stationSeconds`. **Les 11 `BlockType` ont désormais leur éditeur.**

## Terminés ce sprint — C-05 Cibles de bloc → saisie de perf (TLX-062)

- **Module partagé `src/sessions/exercise-target.ts`** — `formatExerciseTarget(ex)` traduit les
  `params` typés (TLX-054→061) en **cible lisible** côté athlète : interval `6 × 90s · récup 120s`,
  sprint `8 × 60m · récup 180s`, endurance `5000m · 5:00/km · D+120m`, hurdles `h 84cm · esp. 8.5m ·
rythme 3`, jumps `élan 30m · 6 complets · 40 contacts`, throws `7.26 kg · 10 tech + 6 complets`,
  circuit `3 tours × 45s`, strength/custom = base v1 (`5 × 3 · 80 kg`). Lecture **défensive** du
  conteneur libre `params` (param manquant/non numérique → ignoré, repli sur la base, jamais
  d'exception). Concrétise l'ADR-18 §« Cibles → pré-remplissage » ; **aucun changement backend ni
  de contrat** (les params round-trip déjà, `results` v1 inchangé).
- **(UI) Saisie de perf (A-04)** — `SessionDetailScreen` remplace son `exerciseTarget` local
  (limité à sets/reps/durée) par le formateur partagé : l'athlète voit la cible **de chaque
  discipline** en regard de l'exercice. +15 tests (14 formateur exhaustif + 1 rendu écran sur bloc
  typé) ; **mobile 152/152** ; lint/typecheck clean. Linear **TLX-47**.

## Terminés ce sprint — C-06/C-07 Assignation + Confirmation (TLX-063)

- **(UI) Écran `CoachAssignScreen`** (`src/coach/CoachAssignScreen.tsx`) — route empilée
  `(coach)/assign/[id]` : sélection multi-athlètes parmi les athlètes liés
  (`GET /coach/dashboard`, **cache partagé** avec C-01/C-02), échéance optionnelle, envoi
  `POST /sessions/:id/assign` (TLX-051) avec en-tête `Idempotency-Key` (clé stable = séance +
  sélection triée). **Confirmation (C-07)** au succès : récap des athlètes affectés + « Terminé ».
  États chargement / erreur / **vide** (aucun athlète lié). Helper de nav `assignSessionHref`.
- **Câblage création → assignation** — le constructeur (C-05) **bascule** sur l'écran d'assignation
  après création d'une séance (`router.replace`, la séance n'étant listée nulle part ailleurs) ;
  en mode édition, bouton « Assigner à des athlètes ». **Referme le cycle création → affectation
  côté coach.** +7 tests écran + builder adapté ; **mobile 159/159** ; lint/typecheck clean
  (types de routes expo-router régénérés). Linear **TLX-48**.
- **Vérif** : tests rendant le **vrai** `CoachAssignScreen` (sélection, `Idempotency-Key`, `dueDate`,
  confirmation, états vide/erreur) + nav création→assign assertée dans le test builder ; smoke live
  (Expo web) de la route `/assign/[id]` (montage écran + titre de séance via param). E2e complet
  non rejoué (API locale non démarrée) — l'endpoint `assign` était déjà validé réel (TLX-051 12/12).

## Terminés ce sprint — C-01 Sections « À revoir » / « Aujourd'hui » (TLX-082/083)

- **Module `src/dashboard/dashboard-sections.tsx`** (helpers purs + composants) ajouté **sous les
  KPIs** du tableau de bord coach (C-01 §4) :
  - **TLX-082 « À revoir »** : athlètes avec `toReviewCount > 0` (dérivé du dashboard, **cohérent
    avec `summary.toReview`**), cliquables vers le détail (C-03) ; **état positif « Rien à revoir »**
    sinon.
  - **TLX-083 « Aujourd'hui »** : affectations à échéance ce jour + statut, via `GET /assignments`
    (role-aware coach) **filtré côté front avec la même borne de jour UTC que le backend**
    (`isDueToday`, statuts `assigned`/`in_progress`) → cohérent avec `summary.today`. Nom d'athlète
    joint depuis le dashboard. États chargement / erreur / vide.
- **Zéro changement backend ni de contrat** — les deux sections dérivent des endpoints existants
  (`/coach/dashboard` + `/assignments`). Helpers purs testés (`isDueToday`, `selectTodayAssignments`,
  `athletesToReview`). +11 tests (helpers + composants + écran) ; **mobile 170/170** ; lint/typecheck
  clean. Linear **TLX-62 / TLX-63**.
- **Refactor de découplage** : `COACH_DASHBOARD_QUERY_KEY` extrait dans `src/dashboard/dashboard-query.ts`
  (sans dépendance UI). Les écrans qui partageaient le cache (C-02, fil de feedback, assignation)
  importaient la constante depuis `CoachDashboardScreen`, ce qui tirait désormais tout son graphe
  (sections → `athlete-session-ui` → enum runtime) et cassait 5 suites de test au chargement. Réglé.
- **Vérif** : tests rendant le **vrai** `CoachDashboardScreen` (sections À revoir/Aujourd'hui,
  états positif/vide) + helpers unitaires. Live e2e non rejoué (API locale non démarrée).

## Validation réelle groupée — cycle coach↔athlète complet (2026-06-09)

**Parcours intégral rejoué en réel** (Docker Postgres :5433 + API `nest start` :3000 + Expo web),
comptes neufs créés via API (coach Karim Diallo / athlète Awa Traoré, groupe « Sprint élite »,
consentements accordés) :

1. **Coach** : login → dashboard **« Tout est à jour »** (TLX-085) avec 1 athlète.
2. **C-05** : « Nouvelle séance » → bloc typé **Sprints** (reps 8 / 60 m / récup 180 s,
   TLX-055) + statut Publiée → `POST /sessions` 201 → **bascule auto sur `/assign/:id`**
   (TLX-063, câblage création→assignation).
3. **C-06/C-07** : sélection d'Awa + échéance du jour → `POST /sessions/:id/assign` 201 →
   **écran de confirmation** (récap athlète) → retour dashboard.
4. **C-01** : KPI Aujourd'hui **1** + section **« Aujourd'hui »** (« Vitesse — 60m départs ·
   Awa Traoré · À faire », TLX-083) + état positif **« Rien à revoir »** (TLX-082) —
   KPIs et listes cohérents.
5. **Athlète** : login Awa → séance « À faire » → détail : **cible typée « 8 × 60m · récup
   180s » dérivée des params du coach (TLX-062 round-trip complet)** → exercice coché +
   notes → perf soumise 201 → affectation « Réalisée ».
6. **Coach** : KPI À revoir **1**, section « À revoir » → **« Awa Traoré · 1 perf à revoir »**
   cliquable → détail C-03 (stats 1/1, 100 %, RPE 7) → revue **C-08** (RPE, exercices, ressenti
   de l'athlète) → **feedback posté** (fil horodaté).
7. **Retour « Tout est à jour »** — la boucle création → assignation → exécution → revue est
   close, KPIs 0/0, Awa « À jour ».

Non rejoué en réel : lignes d'alertes (retard / consentement manquant, TLX-084) — nécessitent
des données en retard ; couvertes par tests composant sur le même chemin de données.

## Terminés ce sprint — C-01 Alertes détaillées + états (TLX-084/085) — **clôt C-01**

- **TLX-084 « Alertes & signaux »** (Carte C-01 §5) — le bandeau agrégé devient une **section
  Alertes** : résumé (mêmes libellés) + **lignes par athlète** cliquables vers C-03 — séances
  manquées (`overdueCount`) et consentement d'accès manquant (`coachAccessGranted === false`).
  Dérivé du contrat ADR-17 existant → **frontend pur** (le ticket prévoyait du backend, mais
  TLX-080 expose déjà les signaux par athlète). Masquée sans signal.
- **TLX-085 « États »** (Carte C-01 §6) — **première utilisation** : carte d'accueil enrichie
  (« Bienvenue sur Talent-X », inviter via code de groupe, préparer ses séances) quand 0 athlète ;
  **« Tout est à jour »** : carte positive globale remplaçant les trois sections quand aucune
  alerte, rien à revoir et rien de prévu (les états vides par section restent pour les cas mixtes).
- +7 tests (helpers `athletesWithOverdue`/`athletesMissingConsent`, `AlertsSection`, `AllClearCard`,
  écran) ; **mobile 177/177** ; lint/typecheck clean. Linear **TLX-64 / TLX-65**.
  **C-01 est complet** (TLX-081 vue principale + 082/083/084/085).

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

## Terminés ce sprint — A-04 Saisie typée : Temps / Intervalles / Essais distance (TLX-072/073/074)

- **ADR-19 (Accepté)** — schéma **results v2** : `timeSeconds` (chrono décimal),
  `distanceMeters`, `failed` (essai mordu) optionnels sur `SetResult` ; `schemaVersion: 2` ;
  extension additive (méthode ADR-18), v1 reste valide. Touche TX-DATA-006 §9.2 + OpenAPI +
  DTO Nest (+17 tests ValidationPipe) ; client orval régénéré ; l'API persiste
  `results_schema_version`. **Pas de discriminant dans `results`** : le mode de saisie dérive
  du `type` du bloc (ADR-18).
- **Module pur `src/athlete/perf-entry.ts`** — mode par `BlockType` (time / distance /
  checklist v1), lignes pré-remplies depuis `params.reps` / `fullJumps` / `fullThrows`
  (TLX-062), parse `7.45` / `7,45` / `1:15.3`, sérialisation v2, réhydratation rétro-compat,
  `formatMeasures` (libellés revue). `SessionDetailScreen` rend les 3 modes ;
  `CoachReviewScreen` (C-08) affiche les mesures. +37 tests mobile.
- **Validé en réel** (Expo web + API locale) : séance VMA (`interval`, reps 6) + Longueur
  (`jumps`, fullJumps 4) → 6 lignes + 4 essais pré-affichés → saisie « 1:12.4 … » + « 5.82 ·
  6.05 · mordu · 6,12 » → doc v2 persisté exact → revue coach « 5.82 m · 6.05 m · mordu ·
  6.12 m » → feedback. Commit `2198203`. Linear **TLX-53/54/55 Done**.
- **Hors périmètre assumé** : TLX-075 (grille de barres) — convention hauteur/tentatives à
  trancher avec l'ADR (cf. ADR-19 §Conséquences).

## Terminés ce sprint — A-05 Confirmation de perf (TLX-078)

- **Écran `PerfConfirmationScreen`** — route empilée `(athlete)/perf/[id]` (hors tab bar) :
  après la **1re soumission**, le détail séance bascule (`router.replace`) sur la
  confirmation — « Performance envoyée ! », récap (RPE, exercices réalisés, **mesures v2**
  via `formatMeasures`, ressenti, date), CTA « Retour aux séances » / « Revoir ma saisie ».
  Cache TanStack préchauffé (`setQueryData`) → aucun appel réseau supplémentaire dans le
  parcours nominal. La **mise à jour** d'une perf garde toast + retour (pas de re-célébration).
  Helpers `src/athlete/navigation.ts` (hrefs typés). +3 tests, nav 1re soumission assertée ;
  **suite mobile 206/206** ; typecheck clean.
- **Validé en réel** (Expo web) : séance Sprint 3×60 m → saisie `7.45 / 7.52 / 7,38` + ressenti
  → redirection `/perf/:id`, récap « 7.45 s · 7.52 s · 7.38 s », « Revoir ma saisie » →
  retour détail réhydraté. Zéro erreur console.

## Terminés ce sprint — A-04 §7 Détection de record + proposition de mise à jour (TLX-076)

- **ADR-20 (Accepté)** — records personnels : **clé d'épreuve dérivée** des blocs typés
  (`sprint:60m`, `hurdles:110m`, `throws:7.26kg`, `jumps` ; sens min/max), **table
  `personal_records`** matérialisée (TX-DATA-006 §5.7, unicité athlète × épreuve,
  `performance_id` nullable pour les records manuels A-07), **mise à jour sur confirmation
  de l'athlète**. Migration expand-only `20260610090000_personal_records` (CHECKs unit/
  direction/valeur). Incluse **export (ADR-14) + purge (ADR-15)**.
- **API** — module pur `progress/record-detection.ts` (dérivation d'épreuve + meilleure
  mesure par perf, lecture défensive) ; `RecordsService` (`detectCandidates`, `confirm`
  revalidé depuis la perf — jamais de valeur libre, portes `data_processing` /
  `coach_access`) ; endpoints `GET /athletes/me/records`, `PUT /athletes/me/records/
{eventKey}`, `GET /athletes/{id}/records` ; `recordCandidates` **additif** sur la réponse
  `Performance` (soumission/MAJ **et** lecture athlète — survit au refetch). OpenAPI +
  orval régénérés. **+21 tests API (262/262)**.
- **Mobile** — carte « Nouveau record ? » sur la confirmation A-05 : candidats avec
  « Ancien record : … » / « Première marque », bouton **Valider** par épreuve
  (`PUT records/{eventKey}`), état ✓ Validé + toast. `formatRecordValue` partagé.
  +2 tests écran.
- **Validé en réel** (Expo web + API locale) : saisie 60 m `7.52/7.45/7.61` → carte
  « 60 m — 7.45 s · Première marque » → Valider → record stocké (lecture athlète + coach
  consent-gated) → perf améliorée 7.30 → candidat `previousValue: 7.45` → confirme 7.30 →
  re-confirmation **422**. Pendant la vérif : bundle Metro à redémarrer après régénération
  du client (cache de résolution) ; correctif découvert en réel — `GET performance`
  athlète inclut désormais les candidats (le refetch écrasait la carte).

## Terminés ce sprint — A-07 Records personnels (TLX-091)

- **Onglet Progression** (placeholder TLX-007 remplacé) : section **« Records
  personnels »** (`src/athlete/PersonalRecordsSection.tsx`) — liste des records
  matérialisés (`GET /athletes/me/records`, socle ADR-20/TLX-076) : épreuve, marque
  formatée (`formatRecordValue`), date, badge « manuel » si `performanceId` absent.
  États chargement / erreur (réessai) / **vide** (« saisis tes perfs… »). Clé de cache
  `['records','me']`, invalidée à la confirmation d'un record (A-05). Les graphes A-06
  (TLX-090) viendront au-dessus de la section. +3 tests ; **mobile 211/211** ;
  typecheck clean. **Aucun changement backend** (socle TLX-076 suffisant) ; l'éditeur de
  record **manuel** reste à spécifier (endpoint à valeur libre absent du contrat —
  complément additif à l'ADR-20 le moment venu).
- **Validé en réel** (Expo web + API locale) : onglet Progression d'Awa → « RECORDS
  PERSONNELS — 60 m · 9 juin 2026 · 7.3 s » (record TLX-076). Zéro erreur console.

## Terminés ce sprint — A-06 Progression athlète (TLX-090, ADR-21)

- **ADR-21 accepté** (contrat `GET /athletes/me/progress` : `metrics` StatsMetrics +
  `series[]` par épreuve clé ADR-20) — OpenAPI enrichi (`ProgressSeries`, `ProgressPoint`,
  unit/direction), client orval régénéré.
- **(API)** `AthleteProgressService` (TLX-090) — dérivation à la lecture sur toutes les
  affectations actives de l'athlète : `metrics` (mêmes dérivations qu'ADR-17) + une série
  par épreuve via `bestMeasuresByEvent` (meilleure marque par perf, points triés par date).
  Porte `data_processing`. Réutilise `PENDING_STATUSES`/`dayBounds`/`round`
  (coach-insights) et la détection ADR-20. +4 tests ; **suite progress 29/29**.
- **(UI) Écran A-06** (`src/athlete/ProgressScreen.tsx`) — remplace le placeholder de
  l'onglet Progression : bandeau métriques (Réalisées, Assiduité, RPE moyen), fenêtre
  **Semaine/Mois/Année** côté client (`progress-series.ts` : `pointsInWindow`,
  `seriesTrend` directionnelle, `barHeights` normalisées), une carte par épreuve
  (barres, tendance ↗/↘/—, dernière marque `formatRecordValue`), états chargement /
  consentement (403 `CONSENT_REQUIRED`) / erreur / vide. `PersonalRecordsSection` (A-07)
  conservée sous les graphes. +9 tests (module pur + écran) ; typecheck clean.
- **Validé en réel** (Expo web + API locale, comptes neufs via API) : coach → 3 séances
  Sprints 60 m assignées → Awa soumet 7.6 / 7.45 / 7.3 → `GET /athletes/me/progress`
  renvoie metrics 3/3 · 100 % · RPE 7 + série `sprint:60m` triée → UI : « 60 m ·
  3 marques · 7.3 s », 3 barres décroissantes, tendance verte ↗ (direction `min`),
  bascules de période OK, zéro erreur console.

## Terminés ce sprint — TLX-110 Infrastructure notifications (ADR-22)

- **ADR-22 accepté** : table `notification_preferences` (1:1 users, défauts en base,
  `marketing` opt-in false, absence de ligne = défauts), taxonomie MVP
  (`session_assigned` → athlète, `performance_feedback` → athlète, `group_update` →
  coach), pipeline BullMQ + provider push abstrait. Migration expand-only.
- **(API) 4 endpoints** `/notifications/*` (squelettes 501 → contrat) :
  `POST devices` (upsert par `token` : ré-association + `last_seen_at` + dé-révocation),
  `DELETE devices/{id}` (révocation logique, ownership, 404), `GET/PUT preferences`
  (défauts sans écriture / upsert partiel).
- **Pipeline** : `NotificationQueueService` (producteur, jobId = clé de dédup,
  backoff expo ×3, l'échec d'enqueue ne casse jamais l'opération métier) →
  `NotificationProcessor` (worker : garde de préférence par type, devices actifs,
  contenu générique ADR-10 — signal + resourceId, jamais de donnée de santé —,
  révocation des tokens signalés invalides) → `PushProvider` abstrait
  (`LoggingPushProvider` en dev ; adaptateurs APNs/FCM à brancher par config).
  `worker.ts` consomme désormais 2 files (`data-export`, `notifications`).
- **Émissions** : affectation créée (assignments), commentaire coach sur perf
  (comments), adhésion groupe (groups) — créations uniquement, jamais les chemins
  idempotents. +16 tests ; **API 282/282** ; typecheck clean.
- **Validé en réel** (API + Redis + worker locaux) : scénario complet —
  device 201 + upsert (même id), GET défauts / PUT partiel, affectation →
  **`PUSH [fcm] … — Nouvelle séance (type=session_assigned resource=<assignmentId>)`**
  loggé par le worker ; préférence off → « ignorée (préférence off) » ; destinataire
  sans device → « sans cible » ; DELETE 204 puis 404 ; révocation par un autre compte 404. **Bug réel attrapé en validation** : BullMQ interdit « : » dans un jobId custom
  → séparateur `--` dans les clés de dédup.
- **Non testé en réel** (credentials absents) : l'envoi APNs/FCM effectif —
  adaptateurs réels + ticket Linear de suivi dédié.

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

1. **TLX-090** (écran Progression A-06, 8 pts) — graphes par discipline au-dessus de la
   section records ; `/athletes/me/progress` encore en 501 (contrat `Progress` à dériver
   des mesures v2 — probable ADR ou précision de contrat).
2. **TLX-075** (grille de barres hauteur/perche, Medium) — convention essais × tentatives à
   trancher (complément ADR-19/20).
3. **TLX-077** (brouillon auto-save + hors-ligne, Medium 8 pts) — TX-ARCH-001 §4.
