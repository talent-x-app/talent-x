# Sprint courant : Pilotage coach — couche données + dérivations (backend ✅)

Objectif : construire la **fondation données** du volet coach (séances → affectations →
performances) puis les **dérivations** (`/coach/dashboard`, `/athletes/{id}/stats`), afin
de débloquer les écrans coach C-01/C-02/C-03.

> Ordre choisi : **construire la couche d'abord** (dépendances honnêtes). TLX-080
> dépendait de TLX-070 + TLX-051, eux-mêmes de TLX-050 — tous étaient des stubs `501`.

## À faire (frontend)

- _(éditeurs typés terminés — TLX-054→061 livrés ↓)_
- _(C-01 complet — TLX-081→085 livrés ↓)_

## Terminés — TLX-110 Historisation des corrections de performance (RB-06, ADR-33)

- **Non-conformité comblée** : `updatePerformance` réécrivait la perf **en place** (`prisma.performance.update`)
  → la règle métier **RB-06** (« l'historique ne doit jamais être modifié sans trace ») était violée — une
  correction de marque effaçait silencieusement la précédente. Seul chemin d'écriture destructif d'historique
  de l'app. **ADR-33 accepté** (3 arbitrages validés).
- **(ADR-33)** mécanisme = **`audit_log` enrichi** (vs table `performance_revisions` — surdimensionnée pour
  une _trace_) ; vue coach de l'historique **différée** (conformité, pas fonctionnalité) ; **records (ADR-20)
  inchangés** — une correction ne mute jamais un PB (souveraineté athlète). **Zéro migration, zéro contrat.**
- **(Module pur `assignments/performance-correction.ts`)** `correctionAudit(before, after)` → `{before, after}`
  si un champ corrigeable (results/rpe/notes/schemaVersion) change, sinon `null` (un PUT idempotent identique ne
  trace rien). `performanceSnapshot` normalise rpe/notes en `null`. `results` (jsonb) comparé par sérialisation
  (avant/après normalisés par Postgres → stable). **+7 tests.**
- **(API)** `updatePerformance` enveloppe désormais `findUnique` + `update` + `auditLog.create('performance.correction',
{before, after})` dans **une seule transaction** → impossible de muter la perf sans laisser la trace (acteur =
  athlète titulaire, `entityId` = perf). **+2 tests service.**
- **(RGPD — ADR-15)** `metadata.before/after` contient les marques de l'athlète = donnée personnelle. Le job de
  purge (`AccountPurgeService.purgeUser`) **n'effaçait pas** `audit_log` → étendu pour **neutraliser** le `metadata`
  des traces de correction (`updateMany … data:{ metadata: Prisma.DbNull }`), squelette d'audit conservé. **+1 test.**
- **Tests** : **API unit 425/425** (+10), **intégration 34/34** (+1), typecheck (src+spec) + lint clean. **Aucun
  changement OpenAPI / DTO / client mobile.**
- **Validé en réel (2026-06-13, intégration DB-backed Postgres :5433)** : soumission RPE 7 / 7.45 → **PUT
  correction** RPE 6 / 7.60 → **1 ligne `audit_log` `performance.correction`** persistée avec `metadata.before.rpe=7`
  / `after.rpe=6` (relue depuis la base) → **PUT identique → aucune nouvelle trace** (count reste 1). **Scrub de
  purge joué en réel** (script jetable) : `metadata` d'une trace de correction passe de la charge complète à `null`,
  `action`/`entityType` conservés.

## Terminés — TLX-123 Mode web/tablette coach — layout adaptatif (constructeur, calendrier, dashboard, assignation)

- **Constat** : l'app tourne déjà sous Expo web (servait à la validation) mais **aucun layout
  adaptatif** — sur grand écran le contenu s'étire sur toute la largeur (lignes interminables,
  cartes démesurées). Les coachs planifient sur grand écran. **Frontend pur, zéro contrat, zéro
  backend.**
- **(Module pur `responsive/breakpoints.ts`)** primitive testable (largeur injectée) :
  `breakpointForWidth` (`compact` < 600 ≤ `medium` < 1024 ≤ `expanded`), `contentMaxWidthForWidth`
  (borne à **960 px** dès le seuil tablette, libre sur téléphone) + hooks réactifs `useBreakpoint`,
  `useIsWide`, `useContentMaxWidth` (sur `useWindowDimensions` → suit rotations/redimensionnements
  web). **+2 tests**.
- **(Composant `responsive/ResponsiveContent.tsx`)** conteneur **centré et borné** : enfant flex
  unique du `ScrollView` (`alignSelf:'center'` + `maxWidth` + `width:'100%'`) → centrage fiable
  cross-plateforme, no-op sur téléphone. **+2 tests** (cap 960 à 1280 px, libre à 375 px).
- **(Câblage)** appliqué aux **4 écrans coach clés** — `CoachDashboardScreen`, `SessionBuilderScreen`,
  `CoachAssignScreen`, `CoachCalendarScreen` : `gap` déplacé du `contentContainerStyle` vers le
  wrapper, `padding` conservé. Zéro changement de comportement sur mobile (mêmes `testID`, mêmes
  flux). +2 tests d'intégration (dashboard : bornage à 1280 px, pleine largeur à 375 px).
- **Tests** : **mobile 473/473** (+6), typecheck + lint clean. **Navigation tablette/desktop**
  (sidebar vs tab bar) volontairement **hors périmètre** (changement structurel de nav) — le gain
  immédiat et robuste = bornage/centrage du contenu.
- **Non rejoué en réel** (smoke Expo web large) : le rendu visuel sur grand écran → suivi **TLX-130**
  (RTL prouve le style `maxWidth` appliqué ; le rendu visuel reste à confirmer en navigateur).

## Terminés — TLX-118 Fil de discussion pré-séance (commentaires de séance en UI)

- **Constat** : l'API `/comments` cible **séance XOR perf** (TLX-086) mais l'UI n'exposait le fil que
  sur la **perf** — l'athlète ne pouvait pas poser une question sur la **séance à venir**. **Frontend
  pur, zéro contrat, zéro backend** (endpoints déjà livrés et validés réel en TLX-086).
- **(Composant `comments/FeedbackThread.tsx`)** généralisé pour accepter une cible **séance**
  (`sessionId`) **ou** perf (`performanceId`, exactement une — comme le contrat) + **titre de section
  configurable** (`title`, défaut « Feedback »). `sessionCommentsKey` ajouté (clé de cache distincte
  `['session', id, 'comments']`). L'invalidation du tableau de bord coach reste **réservée à la cible
  perf** (une discussion de séance ne change aucun statut dérivé). Chemin perf **inchangé** (appelants
  C-08/A-09 intacts).
- **(Mobile)** discussion de séance câblée **des deux côtés** : **athlète** (`SessionDetailScreen`,
  A-03) — fil « Discussion » sur la séance **tant que la perf n'est pas saisie** (puis bascule sur le
  fil de feedback de la perf, A-09 — either/or, pas de `testID` dupliqué) ; **coach**
  (`CoachSessionDetailScreen`) — fil « Discussion » sous les actions Éditer/Assigner, pour répondre aux
  athlètes affectés. Autorisation portée par le serveur (coach propriétaire / athlète affecté).
- **Tests** : +2 `FeedbackThread` (cible séance : liste + post via `sessionId`), +1 coach (discussion
  rendue + post séance), +1 athlète (fil « Discussion » avant saisie, ciblant la séance) ; mocks
  commentaires/toast ajoutés au test coach. **Mobile 467/467** (+4), typecheck + lint clean. UI couverte
  par RTL sur les **vrais** écrans.
- **Non rejoué en réel** (smoke Expo web + DB) : le **chemin commentaire-séance** end-to-end → suivi
  **TLX-129** (la couche `/comments` séance XOR perf est déjà validée réel en TLX-086 ; ici = câblage UI
  d'un composant et d'un endpoint déjà éprouvés).

## Terminés — TLX-115 Assiduité athlète — séries (streaks) & taux de complétion

- **Constat** : la complétion est dérivée pour le coach (ADR-17) mais l'athlète n'avait **aucun
  signal de régularité**. Gamification légère (rétention) : **série de semaines complètes** + **taux
  du mois**. **Frontend pur** dérivé du cache `['assignments']` (partagé A-01/A-02/calendrier) —
  **zéro endpoint, zéro contrat, zéro backend**.
- **(Module pur `athlete/attendance.ts`)** `computeAttendance(list, now)` (déterministe, `now`
  injecté, lecture défensive) → `{ currentStreakWeeks, bestStreakWeeks, monthCompleted, monthTotal,
monthCompletionRate }`. Sémantique **alignée sur le reste de l'app** : `skipped` **exclu** du
  dénominateur (ADR-31/TLX-108) ; découpage **UTC** (comme les bornes de jour backend) ; **semaine
  = lundi** (FR) ; une affectation n'est **évaluable** que si échue (réalisée, ou datée ≤ aujourd'hui)
  → les séances **futures** ne pénalisent pas. Une **semaine** est complète si toutes ses affectations
  évaluables sont réalisées ; **série** = semaines actives consécutives complètes en remontant depuis
  la plus récente. **Choix produit assumé** (hors spec) : les semaines **sans rien de programmé** sont
  transparentes (ne rompent pas la série — l'athlète n'est pas pénalisé d'un trou laissé par le coach).
  `weekKey`, `isEvaluable`, `hasAttendanceSignal` exportés. **+12 tests**.
- **(Composants `athlete/AttendanceSection.tsx`)** `AttendanceSection` (carte autonome, requête
  `['assignments']` partagée, **masquée sans signal**) : éclair + série en cours + sous-titre
  contextuel (« lance ta série » / record / « continue ») + **taux du mois** avec barre de
  progression. `StreakBadge` (pastille compacte) + `AttendanceCard` (présentationnel testable).
  **+6 tests** (carte, badge singulier/pluriel, section visible/masquée).
- **(Câblage)** carte d'assiduité sur **Progression** (A-06, sous les métriques) ; **pastille de
  série** sur l'**Accueil** (A-01, dérivée de la requête déjà présente — zéro fetch additionnel).
  +1 test ProgressScreen, +2 tests AthleteHomeScreen.
- **Tests** : **mobile 463/463** (+21), typecheck + lint clean (aucun test API : zéro backend). UI
  couverte par RTL sur les **vrais** écrans (carte rendue quand séances évaluables, masquée sinon ;
  pastille présente/absente selon la série).

## Terminés — TLX-117 Recherche & filtres (athlètes, séances, modèles)

- **Constat** : aucune recherche nulle part — au-delà de ~20 items les listes deviennent inutilisables.
  **Frontend pur** (filtre client sur les listes déjà chargées) ; **aucun contrat, aucun backend**. Le
  paramètre serveur `query` (conditionnel « si volumétrie ») est **différé** (le filtre client suffit au MVP).
- **(Module pur `search/text-filter.ts`)** `normalizeText` (minuscule + suppression des diacritiques NFD),
  `matchesQuery` (sous-chaîne, **insensible casse/accents** — « lea » trouve « Léa » ; requête vide → vrai),
  `filterByText` (requête vide → **même référence**, ordre préservé). +3 tests.
- **(Composant `components/SearchField.tsx`)** champ de recherche du design system : loupe + saisie +
  bouton d'effacement (×) quand non vide. +1 test.
- **(Câblage)** recherche ajoutée sur les **3 listes** (état sans-correspondance dédié) :
  **Athlètes** (C-02, par nom via `athleteFullName`), **Modèles** (C-10, par titre), **Séances athlète**
  (A-02, par titre de séance). Le champ n'apparaît que si la liste sous-jacente est non vide ; tri/pagination
  existants préservés. +3 tests écran (filtre + sans-correspondance).
- **Tests** : **mobile 442/442** (+7), typecheck + lint clean (aucun test API : zéro changement backend).
  UI couverte par RTL sur les vrais écrans (saisie → liste filtrée → carte « aucune correspondance »).

## Terminés — TLX-116 Records manuels — éditeur + endpoint d'initialisation des PB (ADR-32)

- **ADR-32 accepté** (2 arbitrages validés) : endpoint **POST structuré** (le serveur compose la clé) ;
  écriture = **remplace** (déclaration/correction, sans garde « doit améliorer »). Comble le trou : un
  athlète chevronné ne pouvait pas **initialiser ses PB**, personne ne pouvait **corriger** une marque.
- **(Fabrique canonique)** `composeEvent(family, params)` extrait dans `record-detection.ts` — **source
  unique** épreuve→clé partagée par la détection auto (blocs typés) **et** le manuel → **même `eventKey`/
  unité/sens** (pas de doublon « 60 m »). `eventForExercise` refactoré pour la déléguer (sortie
  byte-identique, tests détection inchangés).
- **(API)** `POST /athletes/me/records` (`ManualRecordRequest` : `family` + paramètre contextuel
  `distanceMeters`/`implementKg`/`discipline` + `value` libre + `achievedAt?`). `RecordsService.createManual`
  compose la clé (422 `INVALID_EVENT` si incohérent), refuse une date future (422 `INVALID_DATE`),
  **upsert** `performance_id = null` (badge « manuel »), porte `data_processing`. **Zéro migration**
  (`performance_id` nullable déjà ADR-20). Le `PUT /{eventKey}` confirm-from-perf reste inchangé.
  OpenAPI → DTO → client orval régénéré.
- **(Mobile)** `ManualRecordEditor` dans A-07 (`PersonalRecordsSection`, athlète seul ; coach en lecture
  seule) : « Ajouter un record » → famille (chips) → paramètre contextuel (distance / poids d'engin /
  hauteur·perche / aucun) → marque + date → `POST`, invalide le cache records. Validation client (marque
  > 0 + paramètre requis).
- **Tests** : **API 415/415** (+5 service, détection inchangée), **int 14/14** (+1 : déclare → corrige
  (remplace) → un seul record, 422 sans distance, 403 sans consentement), **mobile 435/435** (+5 éditeur),
  typecheck (api+mobile) + lint clean. **Validé en réel (2026-06-13, intégration DB-backed Postgres :5433)** :
  POST `{sprint, 60, 7.45}` → record `sprint:60m` (manuel) → POST `{…, 7.6}` **remplace** (1 seul record) ;
  `{sprint, value}` sans distance → **422 `INVALID_EVENT`** ; sans `data_processing` → **403**. UI couverte
  par RTL sur le **vrai** éditeur.

## Terminés — TLX-112 Progression & records côté coach (C-03)

- **Constat corrigé** : le coach avait les stats agrégées (C-03) mais **ni les graphes de progression**
  (`/athletes/me/progress` réservé à l'athlète) **ni les records** (`GET /athletes/{id}/records` livré
  mais câblé nulle part) — l'athlète voyait plus que son coach, à rebours de la promesse « pilotage ».
- **(API)** **un endpoint additif** `GET /athletes/{id}/progress` (coach) — **miroir** de
  `/athletes/me/progress` : la dérivation d'`AthleteProgressService` est extraite en `derive(athleteId)`
  (partagée), `getMyProgress` garde la porte `data_processing`, `getForCoach` applique les **portes
  coach** (lien actif + `coach_access`, mêmes règles que records/stats). OpenAPI → DTO → client orval
  régénéré. Records : endpoint déjà livré, juste consommé. +1 test unitaire.
- **(Mobile)** rendu de progression **mutualisé** : composants extraits dans
  `src/athlete/progress-charts.tsx` (`ProgressMetricsRow`, `ProgressSeriesCard`, `ProgressWindowChips`,
  `RecordRow`) — `ProgressScreen` (A-06) et `PersonalRecordsSection` (A-07) refactorisés pour les
  réutiliser (zéro changement visuel, mêmes testID). Le **détail athlète coach (C-03)** gagne
  `CoachProgressSection` (graphes par épreuve + fenêtre Semaine/Mois/Année via `getAthleteProgress`) et
  `CoachRecordsSection` (`listAthleteRecords`), **consent-gated** : masqués sans `coach_access` (le
  message de consentement reste porté par la section Statistiques). +2 tests écran.
- **Tests** : **API 410/410** (+1), **int 13/13** (+1), **mobile 430/430** (+2), typecheck (api+mobile)
  - lint clean. **Validé en réel (2026-06-12, intégration DB-backed Postgres :5433)** : coach lié sans
    consentement → `/athletes/:id/progress` **403 CONSENT_REQUIRED** ; avec `coach_access` → **200**
    (metrics + series, même forme que `/me/progress`) ; coach **non lié** → **403** (ownership). UI coach
    couverte par RTL sur les **vrais** composants partagés (graphes + records rendus, masqués sans accès).

## Terminés — TLX-113 Monitoring de charge d'entraînement (sRPE / ACWR)

- **Différenciateur flagship sur données déjà collectées** (RPE + durée planifiée + dates) — fait
  passer du « carnet » à l'« outil de prévention des blessures ». **Arbitrages validés** : durée =
  **planifiée** (`brief.durationMinutes`, fallback somme des `durationSeconds` des blocs) ; exposition =
  **bloc `load` additif** par athlète sur `GET /coach/dashboard`, **consent-gated** (`coach_access`).
- **(Module pur `progress/training-load.ts`)** méthode sRPE de Foster, testable isolément :
  `sessionLoad` (RPE × durée), `plannedDurationMinutes` (brief → exercices, lecture défensive),
  `computeTrainingLoad` (charge **aiguë** 7 j, **chronique** = moyenne hebdo 28 j, **ACWR** =
  aiguë/chronique, **monotonie** = moyenne/écart-type quotidien, **contrainte** = hebdo × monotonie),
  `classifyZone` (zone sûre **0.8–1.3** ; `insufficient` sans historique chronique). Déterministe
  (`now` injecté), points hors 28 j / futurs ignorés. **+15 tests**.
- **(API)** `getCoachDashboard` dérive la charge par athlète à la lecture (aucune table, aucun job) :
  sRPE datés (perf `rpe` × durée planifiée de la séance) → `TrainingLoad`, exposé **seulement si
  `coach_access` accordé** (le RPE est une donnée de l'athlète). +2 tests.
- **(Contrat)** **additif** : `Dashboard.athletes[].load` (`TrainingLoad` : acute/chronic/acwr/zone/
  weeklyLoad/monotony/strain/sessions) + enum `LoadZone`. OpenAPI → DTO Nest → client orval régénéré.
  Extension d'ADR-17 (contrat dashboard typé mais extensible) ; pas de divergence → pas d'ADR.
- **(Mobile)** section **« Charge d'entraînement »** sur le dashboard coach : **jauge ACWR** par athlète
  (barre échelle 0..2 colorée par zone) + **badge zone**, **surcharge/sous-charge en tête** (alerte),
  cliquable → C-03 ; masquée sans lecture exploitable, indépendante de « Tout est à jour ». Helpers purs
  (`athletesWithLoad`/`athletesWithLoadAlert`/`formatAcwr`/`gaugeFraction`). +5 tests.
- **Tests** : **API 409/409** (+17), **int 12/12** (+1), **mobile 428/428** (+5), typecheck (api+mobile)
  - lint clean. **Validé en réel (2026-06-12, intégration DB-backed Postgres :5433)** : athlète consenti
  - 1 séance réalisée (RPE 8 × durée planifiée 60) → dashboard `load.acute = 480`, zone calculée →
    **retrait `coach_access` → `load` disparaît** (gate RGPD vérifié contre la vraie base). UI couverte par
    RTL sur le **vrai** composant.

## Terminés — TLX-108 Cycle de vie des affectations (ADR-31)

- **ADR-31 accepté** (3 arbitrages produit validés) : machine à états explicite, `skipped`
  posable par l'**athlète** (« je ne peux pas » + motif) **et** le **coach**, réversible ;
  `skipped` **exclu du dénominateur** de l'assiduité ; notification au coach **hors périmètre** ;
  `DELETE` interdit sur une affectation réalisée.
- **Constat comblé** : `skipped`/`in_progress` existaient dans l'enum + le `CHECK` mais n'étaient
  **jamais posés** ; pas de `PATCH`/`DELETE /assignments/{id}`. Conséquence : une séance ratée restait
  « en retard » **à vie**, insoldable ; l'athlète muet ; le coach sans replan/désassign.
- **(Contrat)** additif : `PATCH /assignments/{id}` (`AssignmentUpdateRequest` : `status` borné —
  jamais `completed` —, `dueDate` nullable = replan, `skipReason`) + `DELETE /assignments/{id}`
  (désassignation soft). `Assignment.skipReason`, `StatsMetrics.skipped` ajoutés. OpenAPI → DTO Nest →
  client orval régénéré.
- **(Modèle)** migration expand-only `20260612130000_assignment_skip_reason` : colonne `skip_reason`
  (CHECK `injury|absence|weather|other`). `in_progress`/`skipped` déjà admis par le CHECK statut → pas
  de migration d'enum.
- **(API)** `patchAssignment` (machine à états + **RBAC par transition** : athlète démarre/skip/un-skip,
  coach replan/skip/un-skip ; `completed` réservé à la perf ; 422 `ASSIGNMENT_STATUS_TRANSITION` /
  `SKIP_REASON_REQUIRED` / `ASSIGNMENT_COMPLETED` / `ASSIGNMENT_UPDATE_EMPTY`) + `removeAssignment`
  (soft-delete coach, 422 sur `completed`). **Dérivations dashboard `overdue` inchangées** (excluent
  déjà `skipped`) → le retard devient soldable ; **assiduité** = `completed/(total − skipped)`
  (coach-insights **et** progress athlète).
- **(Mobile)** module partagé `src/assignments/assignment-lifecycle.tsx` : **`SkipSessionCard`**
  (athlète — « Je ne peux pas faire cette séance » → motif → `skipped`, état signalé + retour arrière ;
  masquée si réalisée) câblée au détail séance (A-03) ; **`CoachAssignmentActions`** (replanifier via
  champ date + désassigner avec confirmation, message dédié sur 422) câblée aux lignes « Aujourd'hui »
  du dashboard coach (refresh dashboard + liste au changement).
- **Tests** : +18 service (patch/remove : transitions, RBAC, motif requis, un-skip, 404/403/422) +
  **+2 intégration DB-backed** (replan coach, skip athlète sort du retard, assiduité exclut skipped,
  transition illégale, désassign RBAC + 422 réalisée) + 6 mobile (skip/un-skip athlète, replan/désassign
  coach + 422). **API 392/392**, **int 16/16**, **mobile 423/423**, typecheck (api+mobile) + lint clean.
- **Validé en réel (2026-06-12, intégration DB-backed Postgres :5433)** — le cycle de vie joué contre la
  **vraie base** via HTTP : affectation échue → retard au dashboard → coach replanifie (athlète interdit 403) → athlète signale indispo (`skipped` + motif) → **retard soldé** (alerts 0) → stats `skipped:1,
missed:0, completionRate:0` → transition illégale `skipped→in_progress` 422 → désassign athlète 403 /
  coach 204 / relecture 404 ; et désassign d'une séance réalisée → 422 `ASSIGNMENT_COMPLETED`. UI mobile
  couverte par RTL sur les **vrais** composants (précédent TLX-106).

## Terminés — TLX-104 Auth : réinitialisation de mot de passe (forgot/reset) (TX-SEC-003 §11)

- **Écart audit TLX-121 résorbé** : `forgot-password` / `reset-password` étaient des stubs **501**
  (routes + OpenAPI exposées). Implémentés **sans changement de contrat** (DTO + OpenAPI existaient).
  `logout`/`logout-all` avaient déjà été livrés sous TLX-121.
- **(Modèle)** migration expand-only `20260612120000_password_reset_tokens` : table de jetons à
  **usage unique et expirant**, seul le **SHA-256** est stocké (`token_hash` unique) — le jeton clair
  ne vit que dans l'email. `used_at` = consommation ; FK `ON DELETE CASCADE`.
- **(API)** `forgotPassword` : **réponse neutre 202 systématique** (anti-énumération) — n'émet un
  jeton + un email que si l'email correspond à un compte actif ; enqueue tolérant aux pannes (jamais
  d'échec propagé). `resetPassword` : valide (existant / non consommé / non expiré / compte actif),
  **consomme atomiquement** (anti-rejeu + course → 400 `INVALID_RESET_TOKEN`), met à jour le hash
  Argon2id et **révoque toutes les sessions** (refresh tokens) + invalide les autres jetons en attente
  — le tout en transaction.
- **(Infra email)** nouveau pipeline calqué sur les notifications (ADR-22) : file BullMQ
  `transactional-email` + `EmailQueueService` (producteur API) → `EmailProcessor` (worker, compose
  sujet/corps/lien) → **`EmailProvider` abstrait** (`LoggingEmailProvider` en dev ; adaptateur SMTP/UE
  à brancher par config — **suivi TLX-128**). `worker.ts` consomme désormais **3 files**. Lien de reset
  = `${APP_PUBLIC_URL}/reset-password?token=…` (`APP_PUBLIC_URL` ajouté à `env.validation`, requis en
  prod-like, défaut Expo web en dev). TTL jeton = `PASSWORD_RESET_TOKEN_TTL_SECONDS` (défaut 1 h).
- **Tests** : +21 (service forgot/reset, queue producteur dont panne Redis avalée, processor +
  composition du lien, controller, env.validation `APP_PUBLIC_URL`) + **5 intégration** DB-backed
  (forgot 202 + jeton haché persisté, forgot neutre email inconnu, reset complet → login bascule +
  sessions révoquées, jeton inconnu/consommé → 400). **API unit 375/375**, **int 16/16**, typecheck +
  lint clean.
- **Validé en réel (2026-06-12, API `nest start` :3001 + worker BullMQ + Redis + Docker DB :5433)** —
  cycle complet par curl avec **token capturé depuis le log du worker** : register → `forgot-password`
  **202** → worker compose l'email et logge le lien `…/reset-password?token=…` → `reset-password`
  **204** → login ancien mdp **401** / nouveau mdp **200** → refresh de l'ancien token **409**
  (sessions révoquées) → rejeu du même token de reset **400** (usage unique). Le maillon
  **Redis → worker → EmailProvider** est joué en vrai (jobs réellement enfilés et consommés).
- **Non testé en réel** (provider absent, comme APNs/FCM en TLX-110) : l'envoi SMTP effectif —
  `LoggingEmailProvider` journalise. Adaptateur réel = **TLX-128**. UI mobile « mot de passe oublié »
  hors périmètre de ce ticket (backend).

## Terminés — TLX-109 Assignation d'une séance à un groupe (ADR-30, lots 1+2)

- **ADR-30 accepté** : le groupe est une **source** d'affectation, **pas** une maille d'exécution.
  `groupIds` au contrat `AssignRequest` → résolution serveur vers les membres actifs → **une
  `SessionAssignment` par athlète** (provenance `group_assignment_id`). L'aval (perf 1:1 affectation,
  dashboard, records, statut « réalisée ») reste **inchangé**. Lots 1 (snapshot) + 2 (dynamique)
  livrés ensemble.
- **(Modèle)** migration expand-only `group_assignments` (intention durable, index unique partiel
  `ux_group_assignment_active`) + colonne nullable `session_assignments.group_assignment_id`
  (`ON DELETE SET NULL` — supprimer l'affectation de groupe ne touche pas l'historique d'exécution).
- **(Contrat)** `AssignRequest` gagne `groupIds` (`athleteIds` optionnel, invariant « au moins un »
  → 422 `ASSIGN_TARGET_REQUIRED`) ; nouvel endpoint `DELETE /sessions/{id}/assign/groups/{groupId}`.
  OpenAPI → DTO → client orval régénéré.
- **(API)** `assignSession` résout les groupes (ownership requis), fan-out avec provenance, dédup par
  couple (athlète explicite l'emporte). **Réconciliation dynamique** : adhésion (`joinGroup`) →
  matérialise les affectations de groupe **à venir / non datées** (jamais les passées) + notifie
  l'athlète ; sortie (`leaveGroup`/`removeGroupMember`) → soft-delete les affectations de provenance
  groupe **non commencées** (garde `completed`/`in_progress`/passées et les affectations individuelles) ;
  `unassignGroup` → soft-delete l'affectation de groupe + ses affectations futures non commencées.
- **(Mobile)** `CoachAssignScreen` : section **« Groupes »** sélectionnable (nom + effectif) au-dessus
  des athlètes — « assigner tout le groupe » en un geste ; confirmation par **effectif réel** résolu
  côté serveur.
- **Tests** : +13 API (assign groupe, dédup, provenance, 422 cible requise, unassign, réconciliation
  adhésion/sortie), +1 mobile. **API 359/359**, **mobile 408/408**, typecheck + lint clean.
- **Validé en réel (2026-06-12, API `nest start` :3001 + Docker DB :5433)** — parcours scripté contre
  la vraie base : coach crée groupe → a1 rejoint → séance future assignée **au groupe** (1 affectation
  matérialisée) → a1 la voit → **a2 rejoint APRÈS et hérite de la séance à venir** → a2 quitte →
  l'affectation future disparaît → désassignation du groupe → a1 ne la voit plus. **Tous les invariants
  ADR-30 vérifiés end-to-end.**

## Terminés — TLX-121 Audit RGPD & sécurité avant lancement (jalon Lancement & Qualité)

- **Audit du backend réel confronté à TX-SEC-003** — rapport `docs/audit/TLX-121-audit-rgpd-securite.md`.
  **Conformes vérifiés** : Argon2id (OWASP), access RS256 + rotation `kid`, refresh opaque rotatif +
  détection de réutilisation (révocation de famille), login anti-énumération (decoy hash), RBAC +
  ownership (lien actif) + `consent.gate` (retrait effectif immédiat car lecture de la dernière ligne
  append-only), effacement soft + révocation refresh/device tokens + audit + purge différée (30 j),
  export async (TTL configurables), `env.validation` fail-fast (aucun secret en dur), push minimal
  (signal + `resourceId`, jamais de donnée santé).
- **🔴 Écart bloquant corrigé** : `logout` / `logout-all` étaient des stubs **501** (routes exposées +
  OpenAPI) → impossible de révoquer une session volée. Implémentés dans `auth.service` (`logout` =
  révoque le refresh courant, borné au titulaire, idempotent/neutre 204 ; `logout-all` = révoque toutes
  les sessions actives). +3 tests.
- **🟡 Durcissement** : `json-logger` gagne une **redaction** récursive (clés `password|token|secret|
authorization|refresh|cookie|otp|2fa` masquées) — garde-fou §11/§14, messages scalaires inchangés. +4 tests.
- **Écarts résiduels ticketés** : forgot/reset-password (501) → **TLX-104** (High, pré-lancement, nécessite
  table tokens + provider email) ; 2FA TOTP + chiffrement secret au repos (501, V2) → **TLX-105** (Medium).
  Arbitrages juridiques §19 (mineurs, DPIA, transferts APNs/FCM/SMTP, DPO, DPA art. 28) = checklist de
  mise en production, hors code.
- **API unit 351/351** (+7), typecheck + lint clean. Linear **TLX-75 (TLX-121)**.

## En cours

- _(rien — backend du sprint terminé)_

## Terminés — TLX-106 Confidentialité & droits RGPD dans l'app (TX-SEC-003 §6/§8/§9)

- **Lacune front rendue exécutable** : les endpoints RGPD existaient et étaient conformes (audit
  TLX-121) mais **aucune UI mobile** ne les pilotait — l'athlète/coach ne pouvait ni gérer ses
  consentements, ni exporter ses données, ni supprimer son compte depuis l'app. **Frontend pur sur
  endpoints existants, zéro backend, zéro contrat.**
- **(Mobile)** `src/profile/PrivacySection.tsx` — section **« Confidentialité & données »** ajoutée à
  l'écran Profil partagé (athlète + coach) :
  - **Consentements (RB-05, retrait aussi simple que l'octroi)** — interrupteurs **role-aware**
    (athlète : `data_processing` + `coach_access` + `marketing` ; coach : `marketing` seul),
    `getConsents` / `updateConsent`, **mise à jour optimiste** avec rollback + toast sur échec.
  - **Export (art. 20)** — `requestExport` (202) puis **polling** `getExport` (pending/processing →
    ready/failed via `refetchInterval`), bouton « Télécharger l'archive » (`Linking.openURL` sur la
    `downloadUrl` présignée), état échec + réessayer.
  - **Suppression de compte (art. 17)** — **confirmation forte en deux temps**, `deleteMe` (202) →
    `signOut` + redirection login.
- **Tests** : +9 `PrivacySection.test.tsx` (affichage role-aware, toggle → `updateConsent`, rollback
  optimiste, export 202→ready→download, export échec, suppression deux temps → signOut+redirect,
  annulation) ; mock de `ProfileScreen.test` complété (`ConsentType`/`JobStatus` + fonctions RGPD,
  car le Profil rend désormais `PrivacySection`). **Mobile 417/417**, typecheck + lint clean.
- **Validé en réel (2026-06-12, API `nest start` :3001 + worker BullMQ + Docker DB :5433 + MinIO)** —
  **couche données RGPD jouée end-to-end** contre la vraie base avec comptes jetables :
  - **Consentements** : `getConsents` `{data:[]}` initial → `updateConsent coach_access=true` persisté
    (`textVersion 2026-01`) → relu → **retrait `=false`** (octroi/retrait symétriques).
  - **Export** : `POST /export` **202** `{status:pending}` → worker → **`ready`** avec `downloadUrl`
    présignée MinIO (`talentx-exports/…`, `expiresAt` J+1).
  - **Suppression** : `DELETE /users/me` **202** → `GET /users/me` **404** (effacement immédiat de l'app).
- **Non rejoué** : smoke Expo web de la section (UI couverte par RTL sur le **vrai** composant + vrai
  `ThemeProvider` ; câblage = un seul import dans `ProfileScreen`). La **couche données** RGPD, elle,
  est validée en réel ci-dessus.

## Terminés — C-10 Bibliothèque de modèles de séance (TLX-064, ADR-29)

- **ADR-29 accepté** (2026-06-12) : un **modèle = une `Session` de statut `template`** (enum additif,
  pas de table dédiée) — non daté, **non assignable**. Bibliothèque = `GET /sessions?status=template`
  (filtre existant), « utiliser » = `POST /sessions/{id}/duplicate` (existant → brouillon). Choisi
  contre une ressource `/session-templates` séparée (≈2× le travail, découplage inutile au MVP) ; le
  `duplicateSession` livré annonçait déjà des « impacts modèles C-10 ».
- **(Contrat)** `SessionStatus` gagne `template` (OpenAPI → DTO Nest → client orval régénéré) ; 422
  `SESSION_NOT_ASSIGNABLE` documenté sur `POST /sessions/{id}/assign`. **Migration expand-only**
  `20260612090000_session_template_status` : la contrainte `chk_sessions_status` admet `template`
  (aucune donnée existante touchée).
- **(API)** garde-fou `AssignmentsService.assertSessionAssignable` — assigner un `template` → **422
  `SESSION_NOT_ASSIGNABLE`** (avant toute vérif de lien athlète) ; les statuts `draft`/`published`/
  `archived` restent assignables. Pas de fuite athlète : le scope de lecture athlète exige déjà une
  affectation active (un modèle ne peut être affecté). +3 tests unitaires (assign template → 422,
  duplicate template → brouillon).
- **(Mobile)** écran **`CoachTemplatesScreen`** (route cachée `(coach)/templates`) — liste
  `GET /sessions?status=template` (clé `['sessions','templates']`), « Créer un modèle » (constructeur
  en mode modèle), « Utiliser ce modèle » (`duplicate` → ouvre le constructeur sur la copie),
  tap carte → édition ; états chargement / erreur / vide, pull-to-refresh. **Constructeur C-05**
  étendu : puce statut **« Modèle »**, date et bouton d'assignation masqués en mode modèle, nav
  post-création vers la bibliothèque (jamais l'assignation), `initialStatus` via param `session/new`.
  **Calendrier coach (C-09)** exclut les `template` (vue dérivée). Entrée « Mes modèles de séance »
  sur l'écran Athlètes.
- **Tests** : +6 écran bibliothèque, +4 constructeur (mode modèle), +1 calendrier (exclusion) ;
  **mobile 407/407**, typecheck + lint clean ; **API unit 344/344** ; client `@talent-x/api-client`
  rebuild + types de routes expo-router régénérés.
- **Validé en réel (2026-06-12, API `nest start` :3000 + Docker DB :5433 + Expo web)** :
  - **Backend (curl + intégration DB)** : création `status:template` persisté → `?status=template`
    le liste → assign du modèle **422 `SESSION_NOT_ASSIGNABLE`** → `duplicate` → **brouillon**
    `(copie)` → assign du brouillon franchit le garde (403 lien athlète, contrôle). Verrouillé par
    `critical-paths.int-spec.ts` (**int 23/23**).
  - **Expo web** : login coach → Athlètes → « Mes modèles » → bibliothèque (2 modèles, « 1 exercice »,
    « Utiliser ») → « Utiliser ce modèle » → `/session/:id/edit` sur la **copie brouillon** (date +
    assignation présentes) → puce **« Modèle »** → en-tête « Modifier le modèle », **date et
    assignation masquées**, bouton « Enregistrer le modèle ». **Bug attrapé en vérif live (corrigé)** :
    la carte de modèle imbriquait un bouton « Utiliser » dans une carte pressable (`<button>` dans
    `<button>` → erreur d'hydratation web) → restructurée en boutons **frères** (en-tête `Pressable`
    - action `Button`), vérifié au DOM (`sameParent`, non imbriqués).

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

## Terminés ce sprint — TLX-111 Notifications in-app + préférences (ADR-23) — **clôt le jalon Progression & Échanges**

- **ADR-23 accepté** : table `notifications` (type + resource_id, `dedupe_key`
  **unique aligné sur le jobId BullMQ**, `read_at`, index user/created + partiel
  non-lus), persistée **par le worker derrière la même garde de préférence que le
  push** (préférence off = silence total, minimisation RGPD) ; contrat additif
  `GET /notifications` (paginé + `unreadCount`) + `POST /notifications/read-all`.
- **(API)** `dedupeKey` voyage dans le payload du job ; `NotificationProcessor`
  upsert l'entrée in-app avant la tentative push (rejeu sans doublon) ; feed +
  read-all sur `NotificationsService`. `performance_feedback.resourceId` =
  **affectation** (la ressource navigable côté athlète — le fil A-09 vit sur le
  détail de séance), décidé en implémentation. +5 tests ; **API 285/285**.
- **(UI)** `src/notifications/` : `NotificationsScreen` (centre — libellés/icônes
  par type composés client (`notification-ui.ts`), point non-lu, date relative,
  read-all à l'ouverture, navigation par type×rôle), `NotificationsLink` (entrée
  Profil avec **badge non-lus**, cache partagé avec le centre),
  `NotificationPreferencesSection` (4 switches, **PUT partiel optimiste** avec
  rollback + toast) — intégrés à l'écran Profil partagé ; routes cachées
  `(athlete|coach)/notifications`. +12 tests ; **mobile 237/237** ; typecheck clean.
- **Validé en réel** (API + Redis + worker + Expo web) : adhésion + affectation +
  commentaire coach → feed athlète `unreadCount 2` (types et `resourceId` =
  affectation vérifiés), feed coach `group_update` ; UI login Awa → Profil :
  **badge 1**, défauts des switches corrects → centre : 3 items libellés datés,
  read-all (badge disparaît) → clic « Nouvelle séance » → **détail de la séance**
  → bascule marketing → PUT persisté (vérif serveur + rechargement). Zéro erreur
  console. Worker : persistance puis « sans cible » (aucun device — chemin push
  déjà validé TLX-110).

## Terminés — TLX-120 Tests E2E parcours critiques — **ouvre le jalon Lancement & Qualité**

- **Fix préalable** : le `pnpm typecheck` d'`apps/api` était **rouge sur main**
  (`records.service.spec.ts` : littéraux `type: 'sprint'` au lieu de l'enum `BlockType`) —
  le step CI `pnpm -r typecheck` était donc cassé. Corrigé (import + `BlockType.Sprint`).
- **Suite E2E DB-backed `test/critical-paths.int-spec.ts`** (7 tests, config `test:int`) —
  le **cycle complet coach↔athlète via HTTP** contre une vraie base migrée :
  register coach+athlète → consentements → groupe + join (lien actif vérifié en base) →
  séance à blocs typés (sprint **+ grille de barres ADR-25**) → assignation idempotente →
  perf v2 (chronos + barres 1.75/1.80/1.85✗) → **candidats records `sprint:60m` +
  `vertical:high` (1.80, sans collision)** → affectation `completed` → dashboard coach
  `toReview` 1→0 après feedback → record confirmé + relu → progression athlète → stats
  coach. Et la **matrice d'autorisation** : RBAC 403 (athlète crée séance), consentement
  403 `CONSENT_REQUIRED` (perf sans `data_processing`, stats sans `coach_access`),
  ownership 403/404 (séance d'un autre coach / inexistante), 401 sans jeton.
  **Couvre le volet API/données de TLX-86** (persistance grille + records `vertical:*`
  joués contre la base — reste le pilotage UI Expo). Int **18/18** (11 auth-rgpd + 7 parcours).
- **Seuils de couverture « ratchet »** (`coverageThreshold`) : api **90/75/83/90**
  (mesuré 92.2/77.4/85.8/92.7), mobile **87/80/84/88** (mesuré 89.9/83.1/87.0/90.6) ;
  script `test:cov` ajouté au mobile. **CI** : steps unitaires passés en `test:cov`
  (les seuils ne s'appliquent qu'avec --coverage) ; step int renommé « intégration &
  parcours critiques ».
- **Flows Maestro TLX-120** : `04-coach-create-assign.yaml` (login coach → séance typée
  Sprints C-05 → bascule assignation C-06 → sélection athlète → confirmation C-07) et
  `05-athlete-perf.yaml` (login athlète → séance à faire → saisie mode Temps → confirmation
  A-05) ; README .maestro mis à jour (commandes + pendant API automatisé en CI). Joués en
  staging/manuel (émulateur requis), testID vérifiés contre les écrans.
- Écarts attrapés en écrivant la suite : champ lien = `endedAt` (pas `revokedAt`) ;
  ownership = **403** pour la séance d'un autre coach (404 réservé à l'inexistant) ;
  liste records = `items` (pas `data`).

## Terminés — TLX-075 Grille de barres : saisie des sauts verticaux (A-04 §4.4, ADR-25) — **clôt les modes A-04 (072→075)**

- **ADR-25 accepté** : le mode de saisie devant dériver du `BlockType` (invariant ADR-18/19), un
  **nouveau type `vertical_jumps`** (« Hauteur / Perche », un type-famille + param `discipline ∈
{high, pole}` comme `sprint:{distance}`) ; **`results` v2 inchangé** — chaque essai = un
  `SetResult` (`distanceMeters` = hauteur en m, `failed` = barre non franchie), barre franchie =
  max non-`failed` (déjà calculé par `bestMeasuresByEvent`) ; records `vertical:{high|pole}` (max, m)
  → lève la collision avec `jumps`. Élimination 3 échecs = **garde-fou d'UI**, pas de contrainte de
  stockage.
- **(Contrat)** ajout `vertical_jumps` à l'enum `BlockType` (OpenAPI → DTO Nest → client orval
  régénéré). **Zéro champ ajouté à `results`.** +1 test ValidationPipe (type + params libres acceptés).
- **(API)** `record-detection` : branche `vertical_jumps` → eventKey `vertical:high|pole` selon le
  param `discipline` (défaut hauteur), unit m, direction max. +2 tests (hauteur/perche ; grille de
  barres → barre franchie = max non-mordue, **pas de collision avec `jumps`**). **API 309/309**.
- **(Mobile)** registre `BLOCK_TYPE_SPECS` : entrée `vertical_jumps` avec **nouveau `kind: 'select'`**
  (sélecteur de chips, param libre en chaîne) pour `discipline` + `startHeightCm`/`incrementCm` ;
  sérialisation builder étendue aux params chaîne. Cible (`exercise-target`) : « Hauteur · départ
  1.65 m · +5 cm ». Module `perf-entry` : **nouveau mode `bars`** (grille pré-remplie depuis
  départ + montée cm→m, sérialisation v2, réhydratation par regroupement des sets par hauteur,
  `clearedBarHeight`, `entryIsCompleted`). `formatMeasures` distingue **barre échouée** (`failed` +
  hauteur → « 1.85 m ✗ ») d'un **mordu** (`failed` sans distance) — sans connaître le type côté revue.
- **(UI) `BarsEntryGrid`** dans `SessionDetailScreen` (A-04 §4.4) : une ligne par barre (hauteur m
  - 3 cellules cyclant – / O / X), ajout de barre, garde-fou d'élimination (3 X sans O → bordure
    danger). +bars module exhaustif + écran (cycle d'essai → sérialisation v2) + builder (sélecteur
    discipline) + cible. **Mobile 309/309** ; typecheck + lint clean.
- **Bug attrapé en test** : les mocks `BlockType` locaux des suites écran ne contenaient pas
  `vertical_jumps` → `BlockType.vertical_jumps === undefined`, et `entryModeFor` mappait alors les
  blocs **sans type** sur `bars` (régression sur un test checklist). Corrigé en complétant les mocks.
- **Non vérifié en réel** (DB-backed e2e) : le parcours coach (séance Hauteur → engagement) →
  athlète (grille → soumission → record `vertical:*`). Couvert par unit/integration + smoke bundler
  (recompilation propre, zéro erreur console). Ticket Linear de suivi créé (règle « ticket pour
  tout ce qui n'est pas testé en réel »).

## Terminés — TLX-100 Calendrier athlète (A-08) + coach (C-09) — **ouvre le jalon Calendrier & Compétitions**

- **Vue dérivée, zéro backend, zéro contrat** (même approche que C-01 §4 / A-06) : le calendrier
  se reconstruit côté front depuis les endpoints existants — athlète via `GET /assignments`
  (séances affectées, séance embarquée), coach via `GET /sessions` (ses séances, role-aware).
  Aucun endpoint ni ADR nécessaires.
- **Module pur `src/calendar/calendar-model.ts`** — dérivation + dates **UTC** (cohérent avec
  `dueDate`/`scheduledDate` calendaires et la borne de jour backend) : `assignmentToCalendarEntry`
  (date = échéance, à défaut date planifiée de la séance ; tonalité/libellé via
  `ASSIGNMENT_STATUS_META`), `sessionToCalendarEntry` (date planifiée ; `SESSION_STATUS_META`
  Brouillon/Publiée/Archivée), `startOfWeek` (lundi), `weekDays`, `weekView`, `groupEntriesByDay`,
  `undatedEntries`, `formatWeekLabel`/`formatDayLabel`. Normalisation défensive (ISO complet →
  jour, valeur vide/invalide → `null`).
- **`CalendarView`** (présentiel partagé) — navigation de semaine (‹ Semaine du X ›, « Revenir à
  aujourd'hui »), grille lundi→dimanche (« Repos » si vide, jour courant surligné), section
  « Sans date » pour les entrées sans échéance ; carte d'entrée = pastille colorée (statut) +
  titre + libellé + chevron, cliquable.
- **Écrans** : `AthleteCalendarScreen` (A-08, cache `['assignments']` **partagé** avec l'onglet
  Séances → pas de re-fetch ; tap → détail séance A-03/A-04) et `CoachCalendarScreen` (C-09,
  cache `['sessions']` ; tap → constructeur C-05). États chargement / erreur (réessai) / vide,
  pull-to-refresh. Placeholder coach remplacé ; **onglet Calendrier ajouté à la tab bar athlète**
  (Accueil · Séances · Calendrier · Progression · Profil).
- +34 tests (modèle pur exhaustif + `CalendarView` + 2 écrans) ; **mobile 271/271** ;
  typecheck + lint clean.
- **Validé en réel** (Expo web + API locale, compte Awa) : onglet Calendrier → semaine courante
  « Semaine du 8 juin », grille Lun→Dim « Repos », section **« Sans date »** listant les 2
  affectations (« Côtes N111 #2 · À faire » pastille neutre, « Vitesse 60m N111 · Réalisée »
  pastille verte) ; tap → détail séance ; « Semaine suivante » → « Semaine du 15 juin » +
  « Revenir à aujourd'hui ». Zéro erreur console. **Bug réel attrapé** : Metro ne réindexe pas
  les nouveaux fichiers à chaud (`Unable to resolve "./calendar-model"`) → redémarrage du bundler
  (cache de résolution), comme au sprint A-07. C-09 non rejoué en réel (couvert par tests
  unitaires — `CalendarView`/modèle partagés et validés côté athlète).

## Terminés (validé en réel) — Groupes : gestion coach + rejoindre athlète (TLX-87/88, ADR-26)

- **Lacune trouvée à l'audit front (live device, 2026-06-10)** : backend groupes livré
  (TLX-30/TLX-041) mais **aucune UI mobile** ne le pilotait — un coach ne pouvait pas créer
  de groupe / partager un code, un athlète ne pouvait pas en rejoindre un. **Bloquant MVP.**
- **ADR-26 accepté** — _lecture athlète de ses groupes_ : nouvel endpoint **`GET /groups/mine`**
  (l'athlète liste ses groupes actifs avec le coach et l'effectif). Le contrat n'exposait que la
  vue coach ; cet ajout est **additif** (aucune rupture). Indexé dans le Journal ADR.
- **(API)** `GET /groups/mine` — DTO `AthleteGroup` (`id`, `name`, `memberCount`, `coach`
  `UserSummary`), `GroupsService.listMyGroups` + mapper `toAthleteGroupDto`, route placée **avant**
  `@Get(':id')` (sinon `mine` capturé comme id). OpenAPI : path `/groups/mine` + schémas
  `AthleteGroup`/`AthleteGroupList` (après `GroupMember`). Client orval régénéré (`getMyGroups`,
  type `AthleteGroup`). +1 test service (`listMyGroups`) + assertion dans la suite DB-backed
  `critical-paths.int-spec.ts` (l'athlète relit son groupe après join). **`groups.service` 20/20.**
- **(Front coach, TLX-87)** module `src/groups/` : `CoachGroupsScreen` (liste `listGroups` +
  création inline `createGroup` → ouverture du détail) et `CoachGroupDetailScreen` (cœur du ticket) —
  **code d'invitation ADR-16** : partage natif `Share`, régénération / révocation (`manageInviteCode`),
  membres (`listGroupMembers` + retrait `removeGroupMember`), édition nom/description (`updateGroup`),
  suppression (`deleteGroup`, soft). Routes empilées `(coach)/groups` + `(coach)/group/[id]` ;
  **points d'entrée** : CTA de l'état vide du dashboard + en-tête de l'écran Athlètes. Helpers de nav
  `src/groups/navigation.ts`, clés de cache `groups-query.ts`.
- **(Front athlète, TLX-88)** `JoinGroupScreen` (route `(athlete)/group/join` : saisie code →
  `joinGroup`, mise en capitales, 404 « code invalide/révoqué » inline, succès → invalide
  `['groups','mine']` + retour) et `MyGroupSection` (section « Mon groupe » du Profil, **gated
  athlète**) : consomme `GET /groups/mine`, carte par groupe (coach + effectif), « Quitter »
  (`leaveGroup`), état vide → CTA « Rejoindre un groupe ».
- **Tests** : 4 fichiers (`CoachGroupsScreen`/`CoachGroupDetailScreen`/`JoinGroupScreen`/
  `MyGroupSection`), **19 tests groups verts** (rendu + interactions : création, code d'invitation,
  retrait, suppression, join 404, quitter, états vide/erreur+réessai). **Typecheck mobile clean**
  (client `@talent-x/api-client` rebuild + types de routes expo-router régénérés pour les nouvelles
  routes group).
- **Validé en réel (2026-06-10, Expo web + API `node dist/main.js` :3000 + Docker DB :5433)** —
  parcours complet joué de bout en bout :
  - **Backend ADR-26** : `GET /groups/mine` athlète → 200 (`data[0]` = groupe + coach + `memberCount`,
    **sans `inviteCode`**) ; coach → **403** (RBAC). Chaîne register→consents→createGroup→join verte.
  - **TLX-88 athlète** : `JoinGroupScreen` (saisie `phtypgf7` → champ **`PHTYPGF7`** mis en capitales →
    Rejoindre → join 200) ; `MyGroupSection` du Profil affiche le groupe (coach + effectif), **se
    rafraîchit en place après join** (1→2 groupes, « Sprint elite · 2 membres »), **Quitter** retire
    la carte.
  - **TLX-87 coach** : entrée « Gérer mes groupes » (écran Athlètes) → `CoachGroupsScreen` (liste) →
    **création** d'un groupe (→ détail + code frais) → `CoachGroupDetailScreen` (code, membres,
    description) → **régénérer / révoquer / générer** le code (tous rafraîchissent **en place**) →
    **suppression** (retour liste, groupe retiré).
- **🐛 Bug attrapé en vérif live (corrigé)** — le code d'invitation **ne se rafraîchissait jamais**
  après régénération/révocation : `POST /groups/{id}/invite-code` renvoyait le **201** par défaut de
  Nest alors que le contrat OpenAPI et l'`@ApiResponse` documentent **200** ; le client généré ne
  traite que 200 en succès → la réponse tombait en `onError`, donc **pas d'invalidation** (le backend
  régénérait bien, mais l'écran gardait l'ancien code — divergence UI/DB confirmée en base). **Fix :**
  `@HttpCode(200)` sur `manageInviteCode` (aligné sur `joinGroup`). **Régression verrouillée** :
  assertion `regenerate → 200` + code différent ajoutée à `critical-paths.int-spec.ts` (int **7/7**),
  groups unit **20/20**. Re-vérifié en réel : régénération → le code bascule **en place** (UI = DB).
- **Non testé / hors UI web** : `updateGroup` (édition) et `removeGroupMember` partagent le pattern
  mutation→invalidation déjà prouvé (régénérer/révoquer) + sont couverts en unit ; `Share` natif
  non testable en web. **Device physique** : dev build APK `com.talentx.app` **inutilisable** — module
  natif `@react-native-community/netinfo` absent (`RNCNetInfo is null`, APK antérieur à la dépendance)
  → vérif faite en Expo web ; rebuild du dev client à prévoir pour repasser sur device.

## Terminés (validé en réel) — Accueil athlète A-01 (TLX-089)

- **Lacune trouvée à l'audit front (live device, 2026-06-10)** : après login, l'athlète tombait sur
  un écran **vide** (`(athlete)/index.tsx` = placeholder « Accueil — A-01 / TLX-065 »), alors que le
  coach a un vrai dashboard. Asymétrie sur la première impression, jamais ticketée comme écran.
- **`AthleteHomeScreen` (A-01)** — **vue dérivée, zéro backend, zéro contrat** : tout vient des caches
  déjà en place (`['assignments']` partagé A-02/calendrier, `['groups','mine']` section Profil,
  `['me']` Profil) → aucun fetch redondant. Salutation par prénom, sous-titre dynamique (« N séance(s)
  prévue(s) aujourd'hui » / « N à faire » / « rien à faire »), section **« À faire »** (3 séances max,
  **plus proche échéance d'abord**, via `AssignmentListItem` réutilisé) → tap vers le détail
  (A-03/A-04), lien « Voir toutes mes séances » au-delà de 3 ; **CTA « Rejoindre un groupe »** si non
  rattaché (réutilise `joinGroupHref`, point d'entrée TLX-88 depuis l'accueil) ; raccourcis Séances /
  Calendrier / Progression. États chargement / erreur (réessai) / positif (« tout est fait ») / vide,
  pull-to-refresh. Commentaire `TLX-065`/`TLX-007` incohérent nettoyé.
- **Module pur `src/athlete/home-model.ts`** (`selectPendingAssignments` tri croissant + sans-date en
  dernier, `isPending`, `assignmentDate`, `isDueToday`/`countDueToday` en UTC, cohérent backend).
- **Tests** : home-model (6) + `AthleteHomeScreen` (8 : salutation, liste à faire, nav détail, voir
  tout, CTA groupe si non rattaché, état positif, vide, erreur+réessai, raccourcis) + smoke
  `screens.test` adapté. **Suite mobile 342/342**, typecheck clean.
- **Validé en réel** (Expo web + API + DB) : login athlète (groupe Sprint elite + 1 séance « VMA
  6x400m » assignée échéance du jour) → accueil **« Bonjour, Awa · 1 séance prévue aujourd'hui »**,
  carte « VMA 6x400m · 10 juin 2026 · 1 exercice · À faire », pas de CTA groupe (déjà rattaché),
  raccourcis ; tap séance → `/session/:id`. Zéro erreur console. (Capture preview indisponible —
  outil screenshot instable dans l'env ; vérif par arbre DOM + logs.)

## Terminés — ADR-28 Brief de séance : double lecture coach/athlète (lots 1–3)

- **ADR-28 accepté** (2026-06-11) : document JSONB versionné `brief` sur `sessions` — partie
  partagée (`athleteIntent`, `durationMinutes`, `difficulty`, `successCriteria`, `stopCriteria`)
  - partie **coach seulement** (`intent`, `coachNotes`) retirée **au serveur** de toute
    sérialisation vers un lecteur athlète (mapper role-aware, philosophie ADR-26).
- **Lot 1 backend (TLX-98, commit `78d493a`)** : migration expand-only `session_brief`,
  `SessionBriefDto` borné, mapper par rôle sur toutes les surfaces (lecture/liste `/sessions` +
  séance embarquée des affectations), OpenAPI `SessionBrief` + TX-DATA-006 §9.4. 329 unitaires +
  21 intégration verts ; **e2e DB réel** : l'athlète ne reçoit jamais `intent`/`coachNotes`.
- **Lot 2 front (TLX-99, commit `8a354b6`)** : constructeur C-05 — section repliable
  « Intention & lecture athlète » + aperçu **« Voir comme l'athlète »** ; détail athlète
  A-03/A-04 — en-tête métriques (Durée · Exercices · Difficulté), « 💡 En une phrase »,
  sections 🔥/🎯/🧊 dérivées, carte « ✅ Réussi si / ⚠️ Stop si » ; revue C-08 — lecture coach
  complète (`intent` + `coachNotes`). 358 tests mobile verts ; **validé en réel** (Expo web) :
  0 fuite coach dans le DOM athlète.
- **Lot 3 (frontend pur, ADR-28 règle 6)** : params d'intensité, pattern TLX-054→061, **zéro
  changement de contrat** — `percentVma` (Intervalles + Sprints) et `tempo` (Musculation,
  nouveau `kind: 'text'` au registre `BLOCK_TYPE_SPECS` : chaîne libre « 3-1-1-0 », clavier
  texte, épurée à la sérialisation) ; cible athlète enrichie (`formatExerciseTarget`) :
  « 6 × 90s · 105 % VMA · récup 120s », « 5 × 3 · 80 kg · tempo 3-1-1-0 ». Musculation sans
  tempo reste **byte-identique v1** (aucun `params` sérialisé — non-régression TLX-060
  conservée). +3 tests ; **mobile 361/361** ; typecheck + lint clean.
- **Validé en réel (Lot 3, API + Postgres locaux)** : `POST /sessions` 201 avec
  `{percentVma: 105}` / `{tempo: "3-1-1-0"}` → persistés tels quels (vérif psql du JSONB) →
  lecture athlète de la séance embarquée : params intacts **et** brief toujours filtré (pas
  d'`intent`/`coachNotes`). Non rejoué : smoke Expo web (champs et sérialisation couverts par
  RTL sur les vrais écrans ; aucun nouveau fichier → pas de risque de cache Metro).

## Terminés — ADR-27 Lot 2 : groupes d'exercices v3, lectures front (TLX-101)

- **Module pur partagé `src/sessions/exercises-doc.ts`** — lecture d'un doc `exercises` v3
  (exercices + groupes mêlés) : `flattenLeaves`/`countLeaves` (un groupe de 3 compte 3),
  `exerciseRenderRows` (lignes de rendu avec **en-têtes de groupe intercalés** + libellés
  **A1/A2** superset, indexation à plat alignée sur l'état de saisie), `leafRounds`,
  `resultForLeaf` (**jointure `order` d'abord** puis repli `exerciseName` — désambiguïse les
  noms dupliqués entre groupes successifs, ADR-27 règle 4). +9 tests.
- **`perf-entry.ts`** — checklist passée en **N tours** (`done: boolean[]`), contexte `rounds`
  (groupe parent) propagé à `makeEmptyEntry`/`initialRowCount` ; **sérialisation positionnelle**
  (`serializePositional`) : un tour sauté intercalé → `{set:k, completed:false}` (l'index
  positionnel `setResults[k]` = tour k), vides en queue coupés ; réhydratation positionnelle
  (`entryFromResult`) ; couvre les modes mesurés (temps/distance) **et** checklist.
- **`SessionDetailScreen` (A-03/A-04)** — état de saisie **par feuille** (`entries[leafIndex]`),
  `GroupHeader` (« {nom} · N tours · R »), `LeafEntry` (membres indentés, A1/A2 superset,
  checklist multi-tours en cases « Tour k », membre **mesuré dimensionné sur `rounds`**),
  jointure `order` d'abord à la réhydratation. testID `exercise-count` ajouté.
- **`brief-ui.tsx` / `athlete-session-ui.tsx`** — compteurs = **feuilles** (`countLeaves`),
  `estimateDurationMinutes` **group-aware** : `rounds × (durées membres + r intra) + R inter`.
- **`session-builder-ui.tsx`** — `blocksFromExercises` **aplatit les feuilles** : un doc à
  groupes hydrate ses membres en blocs éditables sans les perdre (mode édition GET), sans UI
  d'écriture de groupe (Lot 3). **Revue C-08** (`CoachReviewScreen`) **inchangée** : opère déjà
  sur `results.items` à plat (compteur « réalisés » basé feuilles, `formatMeasures` énumère les
  N tours mesurés par feuille).
- +13 tests (exercises-doc 9, session-builder-hydration 2, groupe sur `SessionDetailScreen`,
  N-tours sur `perf-entry`) ; **mobile 377/377** ; typecheck + lint clean.
- **Validé en réel (2026-06-11, API `nest start` :3000 + Docker DB :5433 + Expo web)** —
  comptes neufs via API, séance **v3 à groupes** (échauffement + superset force-vitesse 3 tours
  [Squat `strength` + Bonds `custom`] + série de vitesse 3 tours [sprint `Ligne droite` 60 m]),
  affectée. Détail athlète : en-têtes « 3 tours · R 180s/300s », membres **A1/A2**, checklists
  **Tour 1/2/3**, sprint à **3 lignes de temps** (dimensionné sur `rounds`), métrique **Exercices 4**
  (feuilles) et **durée ~28 min** group-aware, compteur **0/4 → 2/4**. Soumission → perf persistée
  **4 items** (un par feuille), **join `order=4` non contigu** rattaché correctement, **position
  préservée** (Squat `[✓,✗,✓]`, Ligne droite `[7.3s,✗,7.45s]`), **réhydratation positionnelle**
  (Squat re-coche tours 1 & 3, pas le 2 — vérifié couleur accent). **Zéro erreur console.**
- **Suite (Lot 3, TLX-102) : ✅ livré** — écriture des groupes dans le constructeur (cf.
  « Terminés — ADR-27 Lot 3 » ci-dessous).

## Terminés — ADR-27 Lot 3 : écriture des groupes au constructeur C-05 (TLX-102) — **clôt l'ADR-27**

- **`session-builder-ui.tsx`** — modèle **arbre** `EditableNode = EditableBlock | EditableGroup`
  (`makeEmptyGroup`/`isEditableGroup`). **`GroupCard`** : nom, `groupType` en chips (Superset/
  Circuit/Série), `rounds`, récup **r** (intra-tour) / **R** (inter-tours), notes — contenant des
  `BlockCard` membres **réutilisées telles quelles** (contexte `inGroup`). `BlockCard` paramétrée
  (`testIDPrefix`/`label`/`inGroup`/`onGroup`/`onUngroup`) → les testIDs plats du premier niveau
  restent **inchangés** (rétro-compat des tests).
- **Masquage `sets` en groupe (règle 6)** : `isBaseFieldVisible(type, key, inGroup)` masque `sets`
  (dimension portée par `rounds`) **au rendu ET à la sérialisation** (`blockToExercise(…, inGroup)`).
- **`nodesToItems`** — sérialisation v3 avec **`order` global unique** en parcours de lecture
  (groupe puis ses membres, règle 4) ; les **deux** sites (payload + `items` du `BriefEditor`)
  partagent la numérotation. **`nodesFromExercises`** — round-trip v3 sans perte (groupes préservés,
  remplace l'aplatissement du Lot 2). **`findFirstNodeIssue`** — validation **traversante** (nom de
  bloc/groupe, groupe vide, param requis TLX-91 sur les membres) avec numérotation feuille « Bloc N ».
- **`SessionBuilderScreen`** — état arbre, handlers **par chemin** (nœud top / membre + déplacement
  **dans/hors** groupe), boutons « Ajouter un bloc » / « Ajouter un groupe », **bump
  `EXERCISES_SCHEMA_VERSION` → 3** (constante unique ; doc sans groupe byte-stable, seul le tag bump).
- +~20 tests (groupes purs + écran : ajout/édition/déplacement, masquage `sets` rendu+sérialisation,
  validation traversante, order global, round-trip v3) ; **mobile 396/396** ; typecheck + lint clean.
- **Validé en réel bout-en-bout (2026-06-11, Expo web + API + Docker DB :5433)** : le **coach
  construit** « Contraste & vitesse » via le constructeur (échauffement + superset 3 tours [Squat
  `strength` **sans champ Séries** / Bonds]) → `POST /sessions` 201 **`schemaVersion 3`**, **order
  global 1/2/3/4**, `sets` absent du membre (vérif psql/API) → assignation → **athlète** : lecture
  seule du groupe → saisie **multi-tours** (3 cases/membre dimensionnées sur `rounds`) → perf
  persistée **3 feuilles**, **join order non contigu** (1/3/4), **position préservée** (Squat
  `[✓,✗,✓]`, Bonds `[✓,✗,✗]`) → **revue coach 3/3**. Zéro erreur console. **L'ADR-27 (lots 1–3)
  est entièrement livré.**

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

## Prochaine étape — ADR-27 accepté (2026-06-11) : groupes d'exercices v3

ADR-27 validé après audit contre le code (amendements intégrés : jointure résultats
`order` d'abord, séquencement lecture→écriture, extension du masquage TLX-94, impacts
compteurs/durée/mapper). **Ordre de livraison impératif** (ADR-27 règle 7) :

1. **Lot 1 — contrat + backend v3 (TLX-100, commit `60adf4d`) — ✅ livré** : OpenAPI
   `ExerciseGroup` + `items` en `oneOf` sans discriminator (narrowing par présence de
   `kind`), DTO union via `@Transform`/`plainToInstance` (un seul niveau garanti par
   construction + whitelist → groupe imbriqué 422), mapper (`normalizeBlock` laisse les
   groupes intacts), `flattenExerciseLeaves` + jointure `order` d'abord, TX-DATA-006
   §9.5, client orval régénéré. **API unit 342/342, intégration 22/22** (round-trip DB
   d'une séance à groupe), typecheck monorepo clean. `schemaVersion` reste 2 côté builder.
2. **Lot 2 — lectures front (TLX-101, commit `55b1a0f`) — ✅ livré** : détail athlète
   (sections « × N tours », A1/A2, saisie multi-tours dimensionnée sur `rounds`), revue
   C-08, compteurs/durée aplatis, jointure `order` d'abord mobile, hydratation du
   constructeur (sans UI d'écriture). Détaillé dans « Terminés — ADR-27 Lot 2 » ci-dessous.
3. **Lot 3 — écriture constructeur C-05 (TLX-102, commit `d266532`) — ✅ livré** : carte de
   groupe, déplacement dans/hors, extension TLX-94 (`sets` en contexte groupe), **bump
   `schemaVersion` 3**. Détaillé dans « Terminés — ADR-27 Lot 3 » ci-dessous. **ADR-27 clos.**

Hors ADR-27 : params d'intensité `percentVma`/`tempo` (front pur, cadre ADR-28) —
**✅ livrés** (cf. « ADR-28 … lots 1–3 », Lot 3 ci-dessus).
