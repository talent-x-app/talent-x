# Talent-X — Journal des décisions d'architecture (ADR)

Ce fichier est un **artefact vivant** : il consigne les décisions d'architecture structurantes de Talent-X et leur justification, pour qu'elles restent défendables dans le temps et facilitent l'onboarding d'un futur second développeur. Il est versionné dans le dépôt (emplacement conseillé : `docs/adr/`).

Chaque décision suit le format **ADR** : Statut, Date, Contexte, Décision, Conséquences (positives / négatives), Alternatives considérées. Une décision n'est jamais réécrite silencieusement : on en change le statut et, si besoin, on ajoute un nouvel ADR qui la remplace.

**Statuts possibles :** `Proposé` · `Accepté` · `Déprécié` · `Remplacé par ADR-XX`.

**Référentiel documentaire associé :** TX-ARCH-001 (architecture), TX-SPEC-002 (API), TX-SEC-003 (sécurité/RGPD), TX-DATA-006 (modèle de données), TX-OPS-004 (exploitation), TX-PRD-005 (produit), TX-DPIA-007 (AIPD), `talent-x-openapi.yaml` (contrat d'API).

---

## Index des ADR

| # | Décision | Statut |
| --- | --- | --- |
| ADR-01 | React Native + Expo comme socle mobile cross-platform | Accepté |
| ADR-02 | NestJS comme backend de référence (vs Spring Boot) | Accepté |
| ADR-03 | PostgreSQL comme base principale, Redis comme support technique | Accepté |
| ADR-04 | Authentification JWT RS256 court + refresh opaque rotatif avec détection de réutilisation | Accepté |
| ADR-05 | RGPD traité comme capacité système transversale | Accepté |
| ADR-06 | Backend stateless pour le scaling horizontal | Accepté |
| ADR-07 | API REST versionnée sous `/api/v1` (vs GraphQL) | Accepté |
| ADR-08 | Autorisation = RBAC + appartenance + ownership + consentement | Accepté |
| ADR-09 | Traitements asynchrones via file de jobs (BullMQ/Redis) et worker dédié | Accepté |
| ADR-10 | Contrat JSONB versionné pour les exercices et les résultats | Accepté |
| ADR-11 | Observabilité managée au MVP, internalisée ensuite | Accepté |
| ADR-12 | Migrations de schéma rétrocompatibles (expand-contract), gatées dans le pipeline | Accepté |
| ADR-13 | Jobs asynchrones RGPD : table `export_jobs` + split export/suppression (raffine ADR-09) | Accepté |
| ADR-14 | Manifeste d'export RGPD & frontière des données de tiers (complète ADR-05/13) | Accepté |
| ADR-15 | Manifeste d'effacement / anonymisation RGPD (complète ADR-05/13) | Accepté |
| ADR-16 | Révocation du code d'invitation de groupe : colonne `invite_code_revoked_at` (complète TX-DATA-006 §5.1) | Accepté |
| ADR-17 | Contrat explicite des dérivations de pilotage coach (`Dashboard`/`Stats`) (complète OpenAPI · Carte C-01 §8) | Accepté |
| ADR-18 | Schéma `exercises` v2 : blocs typés par discipline, union discriminée (raffine ADR-10 · complète TX-DATA-006 §9.1) | Accepté |
| ADR-19 | Schéma `results` v2 : mesures chronométriques et de distance par essai (méthode ADR-18 · complète TX-DATA-006 §9.2) | Accepté |
| ADR-20 | Records personnels : table `personal_records` + détection de PB à la soumission, confirmation athlète (complète TX-DATA-006 · OpenAPI) | Accepté |
| ADR-21 | Contrat explicite de la progression athlète `/athletes/me/progress` : séries par épreuve + métriques (méthode ADR-17 · briques ADR-19/20) | Accepté |
| ADR-22 | Infrastructure notifications : `notification_preferences`, taxonomie MVP, pipeline BullMQ + provider push abstrait (complète TX-ARCH-001 §4.5) | Accepté |
| ADR-23 | Notifications in-app : table `notifications`, contrat de feed `GET /notifications` + `read-all`, écran préférences (complète ADR-22) | Accepté |
| ADR-24 | Compétitions & engagements d'athlètes : tables `competitions`/`competition_entries`, contrat `/competitions`, autorisation alignée sur les affectations, données non-santé (complète TX-DATA-006 · OpenAPI · TLX-100) | Accepté |
| ADR-25 | Grille de barres (sauts verticaux) : `BlockType` `vertical_jumps` + mode de saisie `bars`, stockage via `results` v2 inchangé (`distanceMeters`=hauteur, `failed`), records `vertical:{high\|pole}` (complète OpenAPI · TLX-075) | Accepté |
| ADR-26 | Lecture athlète de ses groupes & coach : endpoint additif `GET /groups/mine` + schéma dédié `AthleteGroup` (sans `inviteCode`, ADR-16) (complète OpenAPI · TX-SPEC-002 §6 · TLX-88) | Accepté |
| ADR-27 | Schéma `exercises` v3 : groupes d'exercices à un niveau (`kind: group`, tours `rounds` + récup r/R, `groupType` superset\|circuit\|series) — séries de courses, contraste, circuits, gammes ; contrat `results`/records inchangés, jointure `order` d'abord + séquencement lecture→écriture (complète ADR-18 · TX-DATA-006 §9.1 · TLX-95) | Accepté |
| ADR-28 | Brief de séance : document JSONB versionné `brief` (intention du jour, « en une phrase », durée, difficulté, réussi si / stop si, notes coach) + **double lecture coach/athlète appliquée au serveur** — champs coach retirés de toute sérialisation athlète (complète ADR-10 · TX-DATA-006 §5.4/§9 · OpenAPI) | Accepté |
| ADR-29 | Modèles de séance (bibliothèque C-10) : un modèle = une `Session` de statut **`template`** (enum additif), non datée et **non assignable** (assigner un `template` → 422) ; bibliothèque = `GET /sessions?status=template`, « utiliser » = `duplicate` existant — zéro table/migration ; pas de fuite athlète (scope = affectation active) (complète OpenAPI · TX-SPEC-002 §5/§6 · TLX-064) | Accepté |
| ADR-30 | Assignation d'une séance à un **groupe** : le groupe est une *source* d'affectation, **pas** une maille d'exécution — `groupIds` au contrat `AssignRequest` résout vers les membres actifs et **matérialise une `SessionAssignment` par athlète** (aval perf/dashboard/records inchangé). Lot 1 = fan-out snapshot (additif, zéro table) ; Lot 2 = table `group_assignments` + provenance `group_assignment_id` + réconciliation adhésion/sortie (futurs membres). Récurrence hors périmètre (→ TLX-126) (complète OpenAPI · TX-SPEC-002 §5/§6 · TLX-109) | Accepté |
| ADR-32 | Records **manuels** (init/correction des PB) : composeur d'épreuve canonique `eventForManual(family, param)` **miroir** de la détection (même `eventKey`/unité/sens — pas de doublon), nouvel endpoint **`POST /athletes/me/records`** structuré (le serveur compose la clé, le client n'envoie jamais unité/sens), écriture = **remplace** (`upsert`, `performance_id = null`, sans garde « doit améliorer » → correction possible), porte `data_processing`. Zéro migration (`performance_id` nullable déjà ADR-20) ; `PUT /{eventKey}` confirm-from-perf inchangé (complète ADR-20 · OpenAPI · TLX-116) | Accepté |
| ADR-31 | Cycle de vie des affectations : **machine à états explicite** (`assigned ↔ in_progress`, `→ skipped` réversible, `→ completed` réservé à la soumission de perf et terminal) + contrat additif **`PATCH`/`DELETE /assignments/{id}`** (replanifier `dueDate`, poser `skipped` + `skip_reason`, désassigner soft). RBAC : athlète **et** coach posent `skipped` ; coach seul replanifie/désassigne. Dérivations dashboard `overdue` **inchangées** (excluent déjà `skipped`) → le retard devient soldable ; assiduité = `completed/(total − skipped)`. Une colonne `skip_reason` (expand-only), `DELETE` interdit sur `completed`, notifications hors périmètre (complète OpenAPI · ADR-17 · TX-SPEC-002 §5/§6 · TLX-108) | Accepté |
| ADR-36 | **Journal d'entraînement** — séance **libre** auto-créée par l'athlète : crée atomiquement séance (`coach_id = athleteId`, statut additif **`self_logged`**, CHECK expand-only) + auto-affectation `completed` + perf, **réutilisant toute** la maille existante → progression/records/assiduité **athlète** alimentés sans rework (vs `coach_id` nullable, écarté — rayon de souffle large). Endpoint athlète **`POST /athletes/me/training-log`** (porte `data_processing`, candidats records renvoyés). **Invisible du coach** : `coach_id = athleteId` échoue au cloisonnement ADR-51 §D3, donc ni progression/records coach ni dashboard/stats coach (coach-scopés) → pas de distorsion du plan. *(§3 annonçait à l'origine une visibilité coach consent-gated ; **amendé par ADR-51 §D3**, corrigé le 2026-08-20 par TLX-248.)* (complète ADR-20/21/31 · OpenAPI · TLX-111). **Amendé le 2026-08-20 (TLX-253, §B1–B4)** : §5 annonçait une suppression par « chemins existants, propriétaire = l'athlète » — `DELETE /sessions/{id}` étant coach-only, l'athlète était refusé **sur le rôle** et sa séance libre était **irréversible**. Endpoint dédié **`DELETE /athletes/me/training-log/{assignmentId}`** (symétrique du POST, un régime d'autorisation par route — argument déjà retenu en §2), garde propriété + `self_logged` → **404** anti-énumération ; soft-delete atomique séance + affectation (la maille que filtre déjà `AthleteProgressService.derive`) ; le **record confirmé issu de la perf est supprimé** — `personal_records` est matérialisée et l'`ON DELETE SET NULL` ne joue qu'à la suppression physique, il survivrait sinon en orphelin indiscernable d'un record manuel (ADR-32) — **sans recalcul** du record antérieur (un record est revendiqué, pas agrégé, ADR-20) ; confirmation inline ADR-44 §6 côté écran | Accepté | (« répéter chaque mardi jusqu'au… ») : occurrences **matérialisées à la création** (pas de règle paresseuse — ADR-30 Option C écartée) ; modèle = **duplication de séance par date** (occ.1 = originale, occ.2..N = copie serveur assignée à sa date), réutilisant **tel quel** le fan-out ADR-30 (athlètes/groupes, `group_assignments`, réconciliation) → **zéro index/table/idempotence touchés** (vs Option B « séance unique + index `(session,athlete,due_date)` relâché », écartée car touche le cœur protégé par ADR-30). Contrat additif `AssignRequest.recurrence { frequency:'weekly', until }` (dueDate requis, borne 52 occurrences, 422 dédiés) ; notif unique/athlète ; gestion « par série » différée aux programmes (complète ADR-30 §4 · ADR-31 · OpenAPI · TLX-127 · brique TLX-126) | Accepté (impl. à suivre) | — SB (season best) & **marques par année**, **dérivés** des performances (méthode ADR-21, zéro table/migration/endpoint) : **saison = année civile** (split indoor/outdoor **écarté** — aucune donnée de lieu, marques surtout d'entraînement → date trompeuse ; différé à TLX-119) ; exposition **additive sur `ProgressSeries`** (`seasonBest` + `marksByYear[]`), le **PB reste à `personal_records`** (revendiqué, pas agrégé), alignement PB↔SB par la **même `eventKey`** ; miroir coach gratuit (dérivation partagée `derive`, TLX-112) ; RGPD inchangé (rien de neuf persisté) (complète ADR-20/21 · OpenAPI `ProgressSeries` · TLX-114) | Accepté |
| ADR-33 | Historisation des **corrections de performance** (RB-06) : `updatePerformance` écrasait en place → chaque correction écrit désormais une trace **`audit_log`** (`action='performance.correction'`, `metadata={before,after}`, acteur athlète) **dans la même transaction** que l'update (trace aussi durable que la modification). **Zéro migration**, zéro contrat. Choisi contre une table `performance_revisions` (surdimensionnée pour une *trace*). Vue coach de l'historique **différée** (conformité, pas fonctionnalité) ; **records ADR-20 inchangés** (une correction ne mute jamais un PB — souveraineté athlète) ; purge RGPD (ADR-15) **étendue** pour neutraliser le `metadata` des corrections à l'effacement du compte (complète RB-06 · TX-DATA-006 `audit_log` · ADR-15/20 · TLX-110) | Accepté |
| ADR-37 | Lecture athlète des **coéquipiers** de son groupe : endpoint additif membre-gated `GET /groups/{id}/teammates` + schéma minimisé `GroupTeammate` (nom + avatar, sans e-mail/perf/santé) — **complète** ADR-26 (qui n'exposait que l'effectif) ; visibilité d'identité pair-à-pair → revue AIPD requise (complète OpenAPI · TX-SPEC-002 §6 · TX-DPIA-007 · TLX-88). **Amendé le 2026-08-20 (TLX-252, §A1–A5)** : l'**avatar** traverse aussi la relation **coach ↔ athlète**, dans les deux sens — schéma **présenté** `LinkedUserSummary` (= `UserSummary` + `avatarUrl`) appliqué **surface par surface** (`GroupMember.athlete`, `AthleteGroup.coach`, `DashboardAthlete`), **contre** l'élargissement de `UserSummary` qui aurait exposé l'avatar par effet de bord (`Announcement.author` reste sans avatar) ; justification : canal déjà consenti (`coach_access` scopé, ADR-51 §D2) portant des données bien plus sensibles → aucune catégorie de traitement nouvelle ; présentateur **unique** (`TeammatePresenter`, la copie inline de `GroupsService` est supprimée) ; gardes d'autorisation inchangées ; AIPD TX-DPIA-007 §5.8 | Accepté |
| ADR-38 | **Assistant de création/affichage de séance par discipline** (maquette « Nouvelle séance ») : pas de nouveau schéma `exercises` — le payload de la maquette cible **déjà** `exercises` v3 (`kind: group`/`groupType: series`, ADR-27) + `BlockType`/`params` libres (ADR-18). Décision : (1) **nouvel écran « Nouvelle séance » par discipline** (5 assistants Sprint/Haies/Endurance/Sauts/Lancers + presets), point d'entrée *additionnel* — le constructeur générique C-05 reste la voie d'édition et couvre les séances multi-disciplines/mixtes ; (2) **extension additive des clés `params`** par `BlockType` (table dédiée, ex. `startType`/`intensityMode` pour `sprint`, `targetMode`/`targetPercent` pour `jumps`/`throws`…), documentée dans l'OpenAPI + DTO + `BLOCK_TYPE_SPECS` ; (3) **récapitulatif** = extension de `SessionContent`/brief (ADR-28) existants — phrase de séance condensée + KPIs + bascule vue coach/athlète avec cibles individualisées (lecture `personal_records`, ADR-20), scopée à une affectation. Zéro migration, zéro bump `schemaVersion`, `results`/records inchangés (complète ADR-18/27/28 · OpenAPI · TLX-052/152→162) | Accepté |
| ADR-39 | **Refonte UI des assistants par discipline : cartes d'effort dédiées (fidélité maquette)** — l'assistant ADR-38 a été livré comme « mince surcouche du constructeur générique » ; vérification en réel : l'UI ne ressemble pas à la maquette `sprint-card.html` (seul le choix de discipline correspond). Décision (à modèle de données **inchangé**) : remplacer, dans les assistants (**création**), le rendu générique de blocs par une **carte d'effort dédiée** fidèle à la maquette — **Sprint d'abord** comme référence, patron étendu aux 4 autres. **Invariant ADR-38 préservé** : la carte lit/écrit les **mêmes `EditableNode`/`params`** → séance éditable en C-05 sans perte (C-05 reste la voie d'édition + multi-disciplines). Réutilise `Chip` (DS) + `sessionPhrase`/`sessionKpis` (TLX-160, résumé live + volume) ; ajoute la primitive DS `Stepper` ; masque le `% VMA` legacy sur `sprint`. Extension additive `params` : `recoveryType@sprint` (OpenAPI + DTO + `BLOCK_TYPE_SPECS`). Cadrage validé : « au signal » coupé (pas de `Switch`/`atSignal`), **Sprint seul d'abord** (autres disciplines différées), édition existante en C-05. Zéro migration, zéro bump `schemaVersion` (complète ADR-38 · réutilise ADR-18/27/28/20 · TLX-163→167) | Accepté |
| ADR-40 | **Cartes d'effort en édition (inférence de discipline) + fidélité maquette des 4 disciplines restantes** — TLX-167 a porté Haies/Endurance/Sauts/Lancers sans maquette spécifique (faute de mieux) ; comparaison aux 5 prototypes HTML fournis ensuite : écarts (pas de table de records/cible calculée, pas de collapse, presets divergents, quelques champs/libellés). Décision : (1) aligner les 4 cartes sur les prototypes (records + cible calculée, collapse partagé, presets réalignés) — additif, contrat inchangé ; (2) **lever la restriction « édition = toujours générique »** d'ADR-39 via une **inférence de discipline** à partir des `BlockType` des nœuds hydratés (`inferDiscipline`) — carte dédiée si non ambiguë, **repli sur l'éditeur générique** sinon (séance hétérogène/mixte), avec bandeau explicite en cas de repli ; aucun champ `discipline` stocké, aucune migration. (3) `CoachSessionDetailScreen` aligné sur la même inférence pour le résumé lecture seule. Round-trip garanti (`nodesToItems` partagé par les deux rendus) (complète ADR-39 · réutilise ADR-18/27/38 · TLX-167 · nouveaux TLX-168→171) | Accepté |
| ADR-41 | **Carte d'effort « Renforcement / PPG » : 6ᵉ discipline guidée, modèle de données inchangé** — le renforcement musculaire et la PPG n'avaient aucun assistant (saisie générique C-05 seule). Décision : 6ᵉ tuile « Nouvelle séance » (`DisciplineKey 'strength'`) avec une carte d'effort réutilisant la grammaire des 5 cartes athlé, à **deux modes internes** (segmented) : **Muscu** (séries droites, `BlockType.strength`) et **PPG / Circuit** (stations en tours, `BlockType.core` en `group` `circuit`), la bascule remappant le `BlockType` comme Endurance remappe `endurance`↔`interval` (ADR-40). **Round-trip C-05 préservé** : sérialisation sur les champs canoniques (`sets`/`reps`/`load`, `tempo` ADR-28, nom d'exercice = champ base `name`). Mode de charge **% 1RM / kg / poids de corps** via l'enum `LoadUnit` existant ; **RPE** en **param additif** `params.rpe` (zéro changement de contrat REST, pas d'ajout à `LoadUnit`). Parallèle **1RM = record** : charge cible dérivée d'une **table de 1RM fictive** (`ONE_RM_REFERENCE`, front-only, esprit `RECORDS` ADR-40), individualisation par athlète **différée** (affichage, cohérent ADR-20). Badge de volume = **tonnage** (helper additif `session-summary`, repli volume de reps). Inférence ADR-40 étendue : `strength`/`core` → `'strength'` (édition + résumé détail dédiés). Zéro migration, zéro bump `schemaVersion`, `results`/records inchangés (complète ADR-38/39/40 · réutilise ADR-18/27/20/28 · TLX-172→175) | Accepté |
| ADR-42 | **Création/édition « Personnalisé » en canvas composite par bloc** — une fois les 6 cartes livrées, le repli générique d'ADR-40 pour les séances mixtes est incohérent. Décision (Option A validée produit) : le « Personnalisé » devient un **`CompositeCanvas`** qui **segmente la liste `EditableNode[]`** en runs de discipline inférée (réutilise `inferDiscipline`, même mécanique que la carte Renforcement ADR-41 en interne) et rend **chaque bloc avec sa carte d'effort dédiée**. Le composite porte le **chrome de séance** (en-tête résumé live + barres échauffement/retour au calme via `splitEffortNodes`) ; les cartes gagnent une prop additive **`embedded`** (masque en-tête KPI + écha/RAC, défaut inchangé). Sélecteur **« + bloc »** = 6 disciplines + **« Personnalisé »** (segment rendu par l'**éditeur générique C-05 réutilisé** — repli pour blocs `custom`/inclassables). Routage révisé : mono-discipline → carte plein écran (ADR-40 inchangé) ; **mélange reconnu OU présence de blocs `custom` → composite** (remplace le repli générique + bandeau d'ADR-40, le C-05 plein écran ne survit que comme rendu du segment « Personnalisé »). **Zéro nouveau modèle de données / contrat / migration** : segmentation = affichage, round-trip via `nodesToItems` (complète ADR-40 · réutilise ADR-38/39/41/18/27 · TLX-176→179) | Accepté |
| ADR-47 | **Vue calendrier mensuelle + calendrier de groupe scopé au coach** (amende ADR-44 §1/§2) — deux manques de test : le calendrier (A-08) n'avait qu'une **vue semaine**, et le hub de groupe (mince) n'avait **pas de calendrier** alors que les séances du groupe ≠ séances perso (séance libre `self_logged`, ADR-36). Décision : (1) composant `SessionsCalendar` réutilisable **Mois ⇄ Semaine** (helpers purs restaurés, pastilles discipline ADR-43) ; (2) la vue Calendrier de l'onglet Séances passe en **mois** (toutes les séances ; compétitions-entrées différées, lien conservé) ; (3) **onglet « Calendrier » réintroduit dans le hub**, filtré `session.coachId === group.coach.id` → séances **du coach** seulement, **hors séances libres** de l'athlète — **sans Lot 2** (filtrage client, zéro contrat). Hub : Annonces · Calendrier · Coéquipiers · Infos. Écartés : ajouter la vue mois à `CalendarView`, scoper par `group_assignment_id` (Lot 2), garder le hub sans calendrier (complète ADR-44 · réutilise ADR-43/26/36 · TLX-173) | Accepté |
| ADR-46 | **Annonces de groupe (coach → membres)** — canal descendant pour le hub athlète. Table dédiée `group_announcements` (id, group_id, author_id, body, soft-delete) ; **3 verbes** `GET/POST/DELETE /groups/{id}/announcements` (GET = coach proprio **ou** membre actif ; POST/DELETE = coach proprio ; 404 anti-énumération). À la publication, **fan-out notification** à chaque membre actif via l'infra ADR-22/23 avec un **nouveau type `group_announcement`** (≠ `group_update` qui = « membre a rejoint ») — CHECK étendu (migration additive), **pas de nouvelle préférence** (gardé par `groupUpdates`), contenu générique (`resourceId = groupId`, ADR-10). UI : onglet **Annonces** (athlète, hub) + section Annonces (coach). Corps texte seul (≤1000), pas de titre ni d'édition au MVP (supprimer/republier). Écartés : réutiliser `comments` (scopé séance) ou `group_update` (collision sémantique), nouvelle colonne de préférence, chat bidirectionnel, PATCH (complète ADR-44 · réutilise ADR-22/23/30/37 · TLX-173) | Accepté |
| ADR-45 | **Agrégat de présence par séance (compteur sans noms)** — `GET /assignments/{id}/attendance-summary` : sert le compteur agrégé déjà autorisé par ADR-43 §5 (« X présents · Y absents · Z sans réponse »). Agrégat **par séance** (`COUNT(attendance) GROUP BY` sur les `SessionAssignment` du même `sessionId`, fan-out ADR-30) → **pas de provenance de groupe / Lot 2 requise**, **zéro migration**. Réponse = **entiers seuls** (`going/notGoing/maybe/noResponse/total`), **jamais d'identités** (RGPD, AIPD pour le nominatif). RBAC = titulaire de l'affectation **ou** coach propriétaire (404 anti-énumération). Front : ligne d'agrégat dans le détail unique (ADR-44 §4), masquée si `total ≤ 1`, rafraîchie à la déclaration de présence. Écartés : agréger par groupe (couple au Lot 2), endpoint sur `/sessions/{id}` (garde dédiée), liste nominative (AIPD) (complète ADR-43 §1/§5 · ADR-30/37 · TLX-173) | Accepté |
| ADR-44 | **Recentrage IA athlète : surface « Séances » unique (liste/calendrier), hub de groupe mince, onglet « Groupe »** (amende ADR-43 §4) — l'athlète voyait ses séances à 3 endroits (Séances, Calendrier, hub de groupe), le hub re-listant une copie du fil (non scopable en Lot 1, ADR-30). Décision : (1) **hub de groupe mince** = Coéquipiers + Infos seulement (retrait des volets Séances/Calendrier et du détail lecture-seule de TLX-173 Phase A) ; (2) **fusion Séances + Calendrier** en un onglet « Séances » à bascule **Liste ⇄ Calendrier**, réutilisant les écrans existants A-02/A-08 (compétitions ADR-24 préservées) ; (3) **onglet « Groupe »** de premier niveau (sort de Profil) — tab bar **Accueil · Séances · Progression · Groupe · Profil** ; (4) **détail unique** `session/[id]` accueille la **présence** (ADR-43 §1) ; (5) dérivation discipline (ADR-43 §2/§3) conservée → **tag sur la ligne de séance** (pastilles calendrier différées) ; (6) **confirmation** avant « Quitter le groupe ». Asymétrie assumée : athlète **centré séances**, coach **centré groupe** (hub coach TLX-174 inchangé). Écartés : garder le hub group-scoped, fusionner sur les composants TLX-173 (perte compétitions A-08), 6ᵉ onglet (complète ADR-43 · A-01/02/08 · TLX-173) | Accepté |
| ADR-43 | **Hub de groupe athlète : présence (RSVP) orthogonale au cycle d'exécution + discipline & perf attendue dérivées** — champ **additif** `attendance ∈ {going,not_going,maybe}\|null` (+ `attendanceReason` ssi `not_going`) sur l'affectation, **distinct** de `AssignmentStatus` (ADR-31) et **hors assiduité** ; écriture par verbe dédié `PUT /assignments/{id}/attendance` ; `attendanceDeadline` dérivée (`dueDate` − délai `.env`). **Discipline** de séance et **« perf attendue »** **dérivées** des blocs typés (module pur `progress/session-discipline.ts` via `eventForExercise`, ADR-20) — **zéro champ, zéro flag, zéro migration**. Fil & calendrier sur **`GET /assignments` existant** + regroupement/recherche **client** (Lot 1) ; filtres serveur `from`/`to`/`discipline` **différés Lot 2**. **RGPD** : MVP n'expose que le **compteur agrégé** de présence ; identités pair-à-pair **hors périmètre** jusqu'à revue **AIPD/TX-DPIA-007** (gabarit ADR-37). Écartés : `not_going=skipped`, présence booléenne, `discipline`/`requiresPerformance` stockés sur `Session`, filtres serveur dès Lot 1, avatars nominatifs en MVP (complète ADR-26/30/31/37 · réutilise ADR-20/32 · OpenAPI `Assignment`/`Session` · TLX-XXX/YYY) | Accepté |
| ADR-48 | **« Mur d'équipe » : interactions de groupe par paliers RGPD croissants** — transforme le hub descendant (ADR-44/46) en surface sociale, en **3 paliers** ordonnés par risque RGPD. **Palier 1 (sans AIPD)** : réactions emoji **agrégées** sur les annonces (table `announcement_reactions`, contrat = **compteurs + `myReactions`**, jamais « qui ») + accusé de lecture **agrégé** (`readCount/memberCount`) + carte **pouls d'équipe** 100 % dérivée (séances `completed`/PR/série de présence du groupe, fan-out ADR-30) + présence sociale narrative (habille l'agrégat ADR-45) — applique partout le **patron d'agrégat** (entiers seuls). **Palier 2 (bundlé AIPD/TLX-150)** : réactions **nominatives** (pile d'avatars, identité minimisée ADR-37) + **kudos de participation** (👏 sur la présence d'un coéquipier, type notif `group_kudos`) — **jamais sur perf/charge/record** (santé, coach-scopée, ADR-08/21). **Palier 3** : **fil de discussion** bidirectionnel — **rouvre** l'exclusion d'ADR-46, conditionné à une **couche de modération** (signalement/blocage/suppression) + cadrage RGPD. Invariants : agrégat par défaut, frontière santé/perf intacte, réutilisation infra (ADR-45/46/22/23/37), **un ADR d'exécution par palier**. Écartés : chat d'un bloc, nominatif d'emblée, leaderboard de perf, `comments` pour les réactions (complète ADR-44/46 · réutilise ADR-45/43/37/22/23 · TX-DPIA-007 · TLX-150) | Proposé |
| ADR-49 | Mur Palier 2 : exécution réactions nominatives + kudos de participation (exécute ADR-48 P2 · réutilise ADR-37/43/22/23 · TX-DPIA-007 §5.6 · TLX-185) — **amendé (TLX-266)** : la notif `group_kudos` porte l'**affectation**, pas la séance ; sans quoi le tap ouvrait un écran d'erreur | Accepté |
| ADR-50 | Mur Palier 3 : fil de réponses sous annonce + modération (signalement, masquage sur seuil, suppression coach/auteur) — **rouvre ADR-46** · purge ADR-15 · TX-DPIA-007 §5.7 · TLX-186 | Accepté |
| ADR-51 | Appartenance multi-coach : cloisonnement de la visibilité (lectures coach scopées par `coachId`) et consentement `coach_access` par coach — débloque l'adhésion à des groupes de coachs différents (complète ADR-05/08/26 · **amende ADR-36 §3** : la lecture coach exclut les séances libres, explicité le 2026-08-20 par TLX-248) | Accepté |
| ADR-52 | Grammaire de séance unifiée (création) : hiérarchie **Bloc > Série > exercices**, champ « Séries » → « Tours », et série/bloc **libre** rendu par une **carte d'effort générique** (catalogue Type d'effort) au lieu de l'éditeur brut — révise ADR-42 §1/§3 (complète ADR-38/39/41) | Accepté |
| ADR-53 | Onglet **« Séances » coach** (Liste ⇄ Calendrier) en remplacement de l'onglet Calendrier : liste de séances enfin disponible (À venir/Passées/Brouillons/Modèles, dates effectives TLX-195), Modèles rapatriés depuis l'onglet Athlètes — amende ADR-44/47, zéro backend | Accepté |
| ADR-54 | **Entrée unifiée de création** séance/modèle : un modèle (`status:template`, ADR-29) passe désormais par le **même sélecteur de discipline** (assistants ADR-38) qu'une séance — `NewSessionScreen` paramétré par `asTemplate`, `newTemplateHref` pointe sur le picker, statut propagé jusqu'au builder (R17) — complète ADR-29/38, zéro backend | Accepté |
| ADR-55 | **Notifications in-app nominatives** (push générique préservé) : le feed in-app affiche le **prénom** de l'acteur (`actor` résolu au read depuis un `actorId` capturé à l'émission), le **push reste générique** (ADR-10 pour FCM/APNS) — amende ADR-10/23, complète ADR-22 (R1) | Accepté |
| ADR-56 | **react-native-svg pour les graphes riches** : refonte de la progression (courbe lissée + aire + **tooltip par point** + ligne PB + bandeau de marques + delta), lisible et toutes disciplines (unité/sens-aware) — rouvre le « sans dépendance » de TLX-212/R9 ; web immédiat, **device après rebuild dev-client** (TLX-141-bis) | Accepté |
| ADR-57 | **Destination du lien de réinitialisation** : site public statique minimal servi par le Nginx déployé (`/reset-password`, `/privacy`, `/support`) — la récupération doit fonctionner **sans l'app**, et débloque au passage l'exigence « politique de confidentialité en URL publique » de TLX-77 | Accepté |
| ADR-58 | **Remontage par `key` de route** pour les écrans d'onglet masqués (`href: null`), jamais démontés : la `key` dérivée du paramètre devient la règle par défaut au **fichier de route**, exemption possible mais justifiée en commentaire — ferme la classe TLX-236/239/245 (13 routes paramétrées, **1 seule** protégée à ce jour) — **amendé (TLX-257)** : la clé traite le *changement de ressource*, pas la *ré-entrée* ; un parcours à état terminal exige en plus une remise à zéro au focus | Accepté |

---

## ADR-01 — React Native + Expo comme socle mobile cross-platform

- **Statut :** Accepté
- **Date :** 2026-06-04
- **Réf. :** TX-ARCH-001 §4.1, §6

**Contexte.** Talent-X cible iOS et Android, est portée initialement par un développeur solo, et doit rester industrialisable. Maintenir deux bases natives distinctes est hors de portée à ce stade.

**Décision.** Adopter React Native avec le workflow managé Expo, en TypeScript. Conserver le workflow managé tant que les besoins natifs spécifiques restent limités.

**Conséquences.**
- Positives : mutualisation maximale du code iOS/Android, vitesse d'itération élevée, écosystème TypeScript cohérent avec le backend, builds, notifications push et mises à jour OTA facilités.
- Négatives : dépendance à l'écosystème Expo ; certains besoins natifs avancés pourraient à terme imposer une éjection (prebuild) ; les mises à jour OTA exigent une politique claire (cf. TX-OPS-004 §11).

**Alternatives considérées.** Développement natif (Swift/Kotlin) — meilleure intégration native mais coût doublé, incompatible avec un solo ; Flutter — crédible mais introduit Dart, en rupture avec la stack TypeScript du backend.

---

## ADR-02 — NestJS comme backend de référence

- **Statut :** Accepté
- **Date :** 2026-06-04
- **Réf. :** TX-ARCH-001 §4.2

**Contexte.** Deux options crédibles : NestJS (Node.js/TypeScript) et Spring Boot (Java). Le critère dominant pour le MVP est la vélocité et la cohérence de stack pour une seule personne.

**Décision.** Retenir NestJS pour le MVP et la phase de traction.

**Conséquences.**
- Positives : TypeScript de bout en bout avec le mobile, vélocité initiale élevée, courbe d'apprentissage plus douce, bonne structure (modules, DI, décorateurs).
- Négatives : écosystème entreprise moins mature que Spring sur les très grands systèmes d'information.

**Alternatives considérées.** Spring Boot — excellent et très mature, redevient pertinent si l'équipe backend grossit autour d'un socle Java déjà maîtrisé ou en cas d'intégration à un SI fortement orienté Java.

---

## ADR-03 — PostgreSQL comme base principale, Redis comme support technique

- **Statut :** Accepté
- **Date :** 2026-06-04
- **Réf. :** TX-ARCH-001 §4.3, §5 ; TX-DATA-006

**Contexte.** Le domaine (utilisateurs, groupes, affectations, séances, performances) est fortement relationnel, mais le contenu des séances varie selon les sports.

**Décision.** Utiliser PostgreSQL comme source de vérité métier (relationnel + JSONB pour la partie variable). Utiliser Redis comme support technique uniquement : cache et file de jobs (cf. ADR-09), jamais comme source de vérité.

**Conséquences.**
- Positives : transactions solides, indexation mature, réplication éprouvée, bonne compatibilité avec les pratiques RGPD (suppression logique, historisation, exports, audit) ; flexibilité du JSONB sans explosion du schéma.
- Négatives : le JSONB doit être encadré pour éviter l'hétérogénéité des données (cf. ADR-10).

**Alternatives considérées.** Base NoSQL documentaire — souplesse de schéma mais transactions et intégrité relationnelle moins adaptées au cœur du domaine ; tout-relationnel sans JSONB — rigide face à la variabilité des sports.

---

## ADR-04 — Authentification JWT RS256 court + refresh opaque rotatif avec détection de réutilisation

- **Statut :** Accepté
- **Date :** 2026-06-04
- **Réf. :** TX-ARCH-001 §4.4 ; TX-SPEC-002 §9.2 ; TX-SEC-003 §11 ; `talent-x-openapi.yaml`

**Contexte.** Application mobile manipulant des données sensibles, nécessitant des sessions révocables et résistantes au vol de jeton.

**Décision.** Access token JWT court signé en RS256 ; refresh token opaque côté serveur, à usage unique et rotatif ; détection de réutilisation (le rejeu d'un refresh token déjà consommé révoque toute la famille). Déconnexion (`logout` / `logout-all`) et réinitialisation de mot de passe anti-énumération. 2FA TOTP optionnelle pour les comptes coach (V2).

**Conséquences.**
- Positives : sessions révocables, atténuation forte du vol de refresh token, harmonisation de l'algorithme (RS256) à travers les documents.
- Négatives : gestion d'état des familles de tokens côté serveur ; rotation des clés de signature à organiser.

**Alternatives considérées.** JWT longue durée sans refresh — simple mais non révocable et risqué ; sessions serveur classiques — révocables mais contraires au principe stateless (cf. ADR-06) ; HS256 — clé symétrique partagée, moins adaptée à la rotation et à la séparation des rôles que RS256.

---

## ADR-05 — RGPD traité comme capacité système transversale

- **Statut :** Accepté
- **Date :** 2026-06-04
- **Réf. :** TX-SEC-003 ; TX-DATA-006 §6 ; TX-DPIA-007

**Contexte.** Une partie des données (performances) peut permettre d'inférer la santé (art. 9). La conformité ne peut pas être une annexe documentaire ajoutée en fin de projet.

**Décision.** Concevoir la conformité comme une capacité native (privacy by design / by default) : consentement prouvable et conditionnant l'accès, droits activables par l'API, suppression réelle, minimisation, journalisation maîtrisée, transferts encadrés.

**Conséquences.**
- Positives : conformité exécutable et vérifiable ; confiance des utilisateurs ; AIPD facilitée (TX-DPIA-007).
- Négatives : coût de conception initial plus élevé ; contraintes transverses sur l'API et le modèle de données.

**Alternatives considérées.** Conformité « documentaire » a posteriori — moins coûteuse à court terme mais risquée et difficilement auditable pour des données sensibles.

---

## ADR-06 — Backend stateless pour le scaling horizontal

- **Statut :** Accepté
- **Date :** 2026-06-04
- **Réf. :** TX-ARCH-001 §3, §9 ; TX-OPS-004 §4

**Contexte.** L'ambition est de croître sans refonte des fondations, en passant d'un nœud unique à plusieurs instances.

**Décision.** Garder les composants serveurs (API) sans état : aucune donnée de session en mémoire de processus ; l'état partagé vit dans PostgreSQL et Redis.

**Conséquences.**
- Positives : montée en charge horizontale simple (réplicas derrière un load balancer), déploiements progressifs facilités.
- Négatives : impose de sortir tout état partagé (sessions, idempotence, file de jobs) vers des supports dédiés.

**Alternatives considérées.** État en mémoire de processus — plus simple au départ mais bloque le scaling horizontal et le zéro-downtime.

---

## ADR-07 — API REST versionnée sous `/api/v1`

- **Statut :** Accepté
- **Date :** 2026-06-04
- **Réf. :** TX-ARCH-001 §4.4 ; TX-SPEC-002 ; `talent-x-openapi.yaml`

**Contexte.** L'API est consommée par un client mobile et doit évoluer sans casser les versions déployées.

**Décision.** Exposer une API REST versionnée dès la première version publique, sous `/api/v1`, avec OpenAPI comme source de vérité (génération de la documentation et des types client).

**Conséquences.**
- Positives : simple à documenter, tester et faire évoluer ; versionnement explicite des ruptures ; contrat outillable (Swagger, codegen, tests de contrat).
- Négatives : certaines vues composites peuvent nécessiter plusieurs appels ou des endpoints dédiés (ex. tableaux de bord).

**Alternatives considérées.** GraphQL — flexible côté client mais complexité accrue (autorisation fine, cache, coût des requêtes) peu justifiée pour le périmètre du MVP et un solo.

---

## ADR-08 — Autorisation = RBAC + appartenance + ownership + consentement

- **Statut :** Accepté
- **Date :** 2026-06-04
- **Réf. :** TX-ARCH-001 §9 ; TX-SPEC-002 §6 ; TX-DATA-006 (coach_athlete_links)

**Contexte.** Application multi-locataire coach/athlète : le cœur de la sécurité est « un coach ne voit que ses athlètes, sous leur consentement ». Le RBAC seul est insuffisant.

**Décision.** Combiner quatre niveaux, tous appliqués côté serveur via des guards : rôle (coach/athlete), appartenance (lien coach↔athlète actif, matérialisé par `coach_athlete_links`), propriété (ownership des ressources), et consentement (l'accès du coach aux performances est conditionné, RB-08). Le lien coach↔athlète naît d'une appartenance à un groupe ou d'une affectation directe ; un athlète peut avoir plusieurs coachs.

**Conséquences.**
- Positives : modèle de confidentialité explicite et testable (matrice d'autorisation dans TX-SPEC-002 §6) ; le consentement devient une condition d'accès, pas un réglage d'UI.
- Négatives : logique d'autorisation plus riche à implémenter et à tester (scénarios de droits croisés).

**Alternatives considérées.** RBAC seul — insuffisant pour le multi-locataire ; ACL par ressource — plus granulaire mais lourd et inutile au périmètre actuel.

---

## ADR-09 — Traitements asynchrones via file de jobs (BullMQ/Redis) et worker dédié

- **Statut :** Accepté
- **Date :** 2026-06-04
- **Réf. :** TX-ARCH-001 §4.5 ; TX-OPS-004 §2–§4, §7 ; TX-SPEC-002 §11.5

**Contexte.** L'export RGPD, les purges planifiées et les notifications ne peuvent pas s'exécuter de façon synchrone dans le cycle requête/réponse.

**Décision.** Introduire une file de jobs (BullMQ sur Redis) et un process worker séparé de l'API. Les opérations longues répondent en `202 Accepted` avec une ressource de statut. La file est supervisée (profondeur, échecs, latence).

**Conséquences.**
- Positives : opérations longues fiabilisées et observables ; worker mis à l'échelle indépendamment de l'API.
- Négatives : composant d'exploitation supplémentaire à déployer, surveiller et dimensionner.

**Alternatives considérées.** Exécution inline dans l'API — simple mais bloquante, fragile et non scalable ; cron système seul — insuffisant pour les jobs déclenchés par l'utilisateur et le suivi de statut.

---

## ADR-10 — Contrat JSONB versionné pour les exercices et les résultats

- **Statut :** Accepté
- **Date :** 2026-06-04
- **Réf. :** TX-DATA-006 §JSONB ; TX-SPEC-002 §9 ; `talent-x-openapi.yaml` (ExercisesDoc, ResultsDoc)

**Contexte.** Le contenu des séances et des performances varie selon les sports et est stocké en JSONB. Sans contrat, les données deviennent hétérogènes et inexploitables pour l'analytics.

**Décision.** Définir un schéma JSON versionné (`schemaVersion`) pour les documents `exercises` et `results`, le valider à l'écriture (validation côté backend) et documenter sa migration.

**Conséquences.**
- Positives : flexibilité préservée tout en garantissant l'exploitabilité ; évolutions de schéma maîtrisées par version.
- Négatives : validation et gestion de versions à maintenir ; migrations de documents JSONB à prévoir lors d'un changement de version.

**Alternatives considérées.** JSONB libre sans schéma — flexible mais ingérable à terme ; tout-relationnel pour les exercices — rigide face à la diversité des sports.

---

## ADR-11 — Observabilité managée au MVP, internalisée ensuite

- **Statut :** Accepté
- **Date :** 2026-06-04
- **Réf. :** TX-OPS-004 §7 ; TX-ARCH-001 §3

**Contexte.** Maintenir une pile d'observabilité auto-hébergée (Prometheus + Grafana + Loki) sur un nœud unique représente une charge d'exploitation lourde pour un solo.

**Décision.** Au MVP, privilégier une observabilité managée (logs et métriques hébergés). Internaliser une pile auto-hébergée plus tard, à charge constante, lorsque le volume ou les coûts le justifient. L'essentiel reste la discipline : métriques utiles, seuils documentés, alertes actionnables, reliées aux SLO (TX-OPS-004 §7.2).

**Conséquences.**
- Positives : charge d'exploitation réduite au démarrage ; observabilité opérationnelle dès le MVP.
- Négatives : coût d'abonnement et dépendance à un tiers ; migration ultérieure à prévoir.

**Alternatives considérées.** Auto-hébergement dès le MVP — contrôle total mais charge d'exploitation disproportionnée pour une personne ; aucune observabilité au départ — inacceptable pour des données sensibles.

---

## ADR-12 — Migrations de schéma rétrocompatibles (expand-contract), gatées dans le pipeline

- **Statut :** Accepté
- **Date :** 2026-06-04
- **Réf. :** TX-OPS-004 §5 ; TX-DATA-006 (migrations)

**Contexte.** Le déploiement sans interruption (à partir de ≥ 2 instances) impose que le schéma reste compatible avec l'ancienne et la nouvelle version de l'application pendant un déploiement progressif. La migration de schéma est un vecteur d'incident classique en production.

**Décision.** Appliquer une discipline expand-contract (migrations rétrocompatibles : d'abord étendre, déployer, puis contracter) et faire de la migration une étape explicite et bloquante du pipeline CI/CD, vérifiée sur staging avant la production.

**Conséquences.**
- Positives : déploiements progressifs sûrs ; risque de panne lié aux migrations fortement réduit.
- Négatives : chaque changement de schéma se fait en plusieurs étapes, plus exigeant à orchestrer.

**Point ouvert.** Choix de l'outil de migration (Prisma ou TypeORM) à arrêter (cf. TX-OPS-004 §15). La décision ci-dessus est indépendante de l'outil retenu.

**Alternatives considérées.** Migrations directes non rétrocompatibles — simples mais imposent une fenêtre d'indisponibilité et cassent le zéro-downtime ; migrations manuelles hors pipeline — non reproductibles et risquées.

---

## ADR-13 — Jobs asynchrones RGPD : table `export_jobs` + split export/suppression

- **Statut :** Accepté · **Date :** 2026-06-08 · **Raffine :** ADR-09

Premier ADR **externalisé** dans `docs/adr/` (emplacement conseillé en tête de ce journal).
Texte complet : [`docs/adr/ADR-13-jobs-asynchrones-rgpd.md`](adr/ADR-13-jobs-asynchrones-rgpd.md).

## ADR-14 — Manifeste d'export RGPD & frontière des données de tiers

- **Statut :** Accepté · **Date :** 2026-06-09 · **Complète :** ADR-05, ADR-13

Fige le contenu de l'export RGPD (sections par rôle, exclusions des secrets/tiers) et la frontière
des données de tiers, pour TLX-033. Texte complet :
[`docs/adr/ADR-14-manifeste-export-rgpd.md`](adr/ADR-14-manifeste-export-rgpd.md).

## ADR-15 — Manifeste d'effacement / anonymisation RGPD

- **Statut :** Accepté · **Date :** 2026-06-09 · **Complète :** ADR-05, ADR-13 (§2)

Fige le manifeste d'effacement (soft-delete immédiat + purge/anonymisation différée), la frontière
effacement-vs-anonymisation et la rétention, pour TLX-034. Texte complet :
[`docs/adr/ADR-15-effacement-anonymisation-rgpd.md`](adr/ADR-15-effacement-anonymisation-rgpd.md).

**En bref.** L'export RGPD devient un job asynchrone à **état persistant** (nouvelle table `export_jobs`,
worker BullMQ/Redis, archive sur stockage objet OVH S3, URL présignée générée au GET). La **suppression**
reste conforme à TX-DATA-006 §12 (soft-delete immédiat + purge planifiée, **sans** table de jobs). Débloque
TLX-033 puis TLX-034 ; socle livré par TLX-035.

---

## ADR-17 — Contrat explicite des dérivations de pilotage coach (Dashboard/Stats)

Décision complète : [`docs/adr/ADR-17-contrat-derivations-pilotage-coach.md`](adr/ADR-17-contrat-derivations-pilotage-coach.md).

**En bref.** Les schémas `Dashboard` et `Stats`, **volontairement ouverts** au MVP
(`additionalProperties`), sont **figés** pour décrire le payload réel livré par TLX-080 :
statut par athlète (`up_to_date`/`late`/`pending_review`), compteurs, état `coach_access`,
agrégats (`toReview`, `today`, alertes) et métriques athlète typées. Permet un client
`@talent-x/api-client` **typé de bout en bout** pour le tableau de bord C-01 (TLX-081).
Rétrocompatible (champs ajoutés, aucun retiré) ; OpenAPI ↔ DTOs Nest alignés.

---

## ADR-18 — Schéma `exercises` v2 : blocs typés par discipline (union discriminée)

Décision complète : [`docs/adr/ADR-18-schema-exercises-v2-blocs-types.md`](adr/ADR-18-schema-exercises-v2-blocs-types.md).

**Statut : Accepté** (validé 2026-06-09 — débloque TLX-053→061 et TLX-062).

**En bref.** Le contrat `exercises` v1 (TX-DATA-006 §9.1, ADR-10) décrit des blocs
**génériques** sans `type` ; les éditeurs typés C-05 (haies, sauts, intervalles…)
exigent des champs absents, rejetés par le backend (`forbidNonWhitelisted` → 400).
Proposition : **v2 en union discriminée additive** — champ `type` (`BlockType`), base
commune = champs v1, objet `params` validé selon `type` pour les champs propres à la
discipline, `schemaVersion: 2`. **Rétro-compatible** (un bloc sans `type` = `custom`) :
l'éditeur générique livré par TLX-052 devient une variante, **zéro rework**. Débloque le
pré-remplissage A-04 (TLX-062) que le texte libre `notes` ne permettait pas.

---

## ADR-19 — Schéma `results` v2 : mesures chronométriques et de distance par essai

Décision complète : [`docs/adr/ADR-19-schema-results-v2-mesures-typees.md`](adr/ADR-19-schema-results-v2-mesures-typees.md).

**Statut : Accepté** (validé 2026-06-10 — débloque TLX-072/073/074, modes de saisie A-04 §4).

**En bref.** Le contrat `results` v1 (TX-DATA-006 §9.2) ne porte que `reps`/`load`/
`durationSeconds` (entier)/`completed` par série : impossible d'y saisir un chrono décimal
(7.45 s) ou une distance d'essai (6.42 m), rejetés par le backend (`forbidNonWhitelisted`).
Proposition : **v2 additif** sur `SetResult` — `timeSeconds?` (décimal, temps mesuré),
`distanceMeters?` (décimal), `failed?` (essai raté/mordu), `schemaVersion: 2`. Pas de
discriminant dans `results` : le mode de saisie dérive du `type` du bloc (ADR-18) côté
client. **Rétro-compatible** (aucun champ v1 modifié — `durationSeconds` garde sa sémantique
de durée tenue). Symétrie cibles (ADR-18) ↔ mesures ; la grille de barres (TLX-075) reste à
trancher.

---

## ADR-20 — Records personnels : table matérialisée + détection de PB à la soumission

Décision complète : [`docs/adr/ADR-20-records-personnels.md`](adr/ADR-20-records-personnels.md).

**Statut : Accepté** (validé 2026-06-10 — débloque TLX-076 ; TLX-091 — A-07 — en dépend).

**En bref.** Ni TX-DATA-006 ni l'OpenAPI ne définissent de record personnel, alors que
TLX-076 exige « détection de PB + proposition de mise à jour » et TLX-091 un écran A-07.
Proposition en trois volets : **clé d'épreuve dérivée** des blocs typés ADR-18
(`sprint:60m`, `throws:7.26kg`…) avec sens min/max ; **table `personal_records`**
matérialisée (unicité athlète × épreuve, `performance_id` nullable pour les records
manuels, mêmes portes consentement que les perfs, incluse export/effacement RGPD) ;
**détection à la soumission** (`recordCandidates` additif sur `Performance`) avec mise à
jour **sur confirmation de l'athlète** (`PUT /athletes/me/records/{eventKey}`, valeur
revalidée depuis la perf). Écartés : records dérivés à la lecture (pas de proposition ni
de records manuels), mise à jour automatique (retire le contrôle à l'athlète).

---

## ADR-21 — Contrat explicite de la progression athlète (`/athletes/me/progress`)

Décision complète : [`docs/adr/ADR-21-contrat-progress-athlete.md`](adr/ADR-21-contrat-progress-athlete.md).

**Statut : Accepté** (validé 2026-06-10 — débloque TLX-090, écran Progression A-06).

**En bref.** Le schéma `Progress` est un conteneur libre et l'endpoint répond 501,
alors qu'A-06 veut des graphes par discipline. Proposition (méthode ADR-17) :
`series[]` = une série par **épreuve** (clé ADR-20, dérivée des blocs typés) avec un
point par perf soumise (`value` = meilleure marque de la perf via
`bestMeasuresByEvent`, `date` = soumission) ; `metrics` = dérivations `StatsMetrics`
(ADR-17) appliquées à soi, tous coachs confondus ; porte `data_processing`.
Dérivation à la lecture, zéro migration, segmentation temporelle côté client.
Écartés : conteneurs libres dérivés côté mobile (logique d'épreuve dupliquée),
agrégats matérialisés (prématuré), fenêtre serveur dès le MVP.

---

## ADR-22 — Infrastructure notifications : préférences, taxonomie d'événements, pipeline push

Décision complète : [`docs/adr/ADR-22-infrastructure-notifications.md`](adr/ADR-22-infrastructure-notifications.md).

**Statut : Accepté** (validé 2026-06-10 — débloque TLX-110 ; TLX-111 consommera la même taxonomie).

**En bref.** Le contrat définit `NotificationPreferences` sans table, et aucun document
ne fixe quel événement métier déclenche quelle notification. Proposition : table
`notification_preferences` 1:1 users (colonnes explicites, défauts en base —
`marketing` opt-in à `false`, absence de ligne = défauts) ; taxonomie MVP à trois
émissions gardées par leur préférence (`session_assigned` → athlète,
`performance_feedback` → athlète, `group_update` → coach) ; pipeline BullMQ file
`notifications` (payload minimal non sensible `{type, recipientUserId, resourceId}`,
pattern `data-export`) ; provider push abstrait (implémentation logging en dev,
adaptateurs APNs/FCM par config — frontière testable sans credentials) ; tokens
upsert par `token` + révocation logique. Conforme ADR-10 (rien de sensible dans le
push). Écartés : JSONB sur `users`, envoi synchrone, historique dès TLX-110, SDK
dans les services métier.

---

## ADR-23 — Notifications in-app : historique, contrat de feed, écran préférences

Décision complète : [`docs/adr/ADR-23-notifications-in-app.md`](adr/ADR-23-notifications-in-app.md).

**Statut : Accepté** (validé 2026-06-10 — débloque la moitié in-app de TLX-111).

**En bref.** TLX-111 doit livrer un centre de notifications in-app, mais rien n'existe
(ni table, ni endpoint, ni écran maquetté) — l'ADR-22 avait volontairement repoussé
l'historique vers ce ticket. Proposition : table `notifications` (type + resource_id +
`dedupe_key` unique aligné sur le jobId BullMQ, `read_at`), **persistée par le worker
derrière la même garde de préférence que le push** (un interrupteur = la notification,
pas un canal) ; contrat additif `GET /notifications` (paginé + `unreadCount`) et
`POST /notifications/read-all` ; côté mobile, section Préférences (4 switches) et
centre de notifications avec badge dans l'onglet Profil (pattern UI kit). Device token
mobile → reste dans TLX-84. Écartés : persistance côté API (double garde), préférences
ne coupant que le push (collecte refusée), lecture unitaire, cloche en tab bar.

---

## ADR-24 — Compétitions & engagements d'athlètes

Décision complète : [`docs/adr/ADR-24-competitions-engagements.md`](adr/ADR-24-competitions-engagements.md).

**Statut : Accepté** (validé 2026-06-10 — pré-requis de TLX-101 ; calendrier inclus, pas de 6ᵉ onglet, `event_label` libre, statuts engaged/confirmed/withdrawn).

**En bref.** TLX-101 (« Compétitions — CRUD + engagement ») ne s'appuie sur rien : pas
d'entité TX-DATA-006, pas de chemin OpenAPI, pas de modèle Prisma, pas de maquette. Proposition,
calquée sur le couple séances/affectations : deux tables expand-only `competitions` (événement
propriété du coach) et `competition_entries` (engagement athlète, idempotent via unique partiel
`ux_entry_active`) ; contrat additif `/competitions` (+ `/entries`) role-aware ; autorisation
**rôle + propriété + lien actif** (le coach pilote, l'athlète consulte) ; **classification RGPD :
données de planification, PAS de santé → aucune porte de consentement** (les résultats chiffrés,
eux, resteraient des données de santé → hors périmètre). Les compétitions datées **enrichissent le
calendrier TLX-100** (entrée distincte, via `competitionToCalendarEntry`). Écartés : compétition
= type de séance, auto-inscription athlète, consentement sur données non sensibles, résultats dans
ce ticket. Quatre questions ouvertes (périmètre calendrier, navigation sans 6ᵉ onglet, `event_label`
libre, statuts d'engagement) à trancher avant code.

---

## ADR-25 — Grille de barres : saisie des sauts verticaux (hauteur / perche)

Décision complète : [`docs/adr/ADR-25-grille-de-barres-sauts-verticaux.md`](adr/ADR-25-grille-de-barres-sauts-verticaux.md).

**Statut : Accepté** (validé 2026-06-10 — dernier mode de saisie A-04, TLX-075).

**En bref.** La grille de barres (saut en hauteur / perche : barres successives, 3 essais
par barre, barre la plus haute franchie) bute sur trois manques : aucun `BlockType` ne
désigne un saut **vertical** (`jumps` = horizontal, mesure = distance par essai), or le mode
de saisie **doit** dériver du type (invariant ADR-18/19) ; la détection de records (ADR-20)
ferait **collisionner** une barre à 1.85 m avec une longueur à 6.42 m sous la clé `jumps` ;
aucune convention de stockage de la grille n'est actée (ADR-19 l'avait renvoyée ici).
Proposition : **ajouter `BlockType.vertical_jumps`** (« Hauteur / Perche », un type-famille +
param `discipline ∈ {high, pole}`, comme `sprint:{distance}`) ; **réutiliser `results` v2
sans le toucher** (chaque essai = un `SetResult` : `distanceMeters` = hauteur en m, `failed`
= manqué ; barre franchie = max non-`failed`, déjà calculé par `bestMeasuresByEvent`) ;
nouvelle branche records `vertical:{high|pole}` (max, m) qui lève la collision. La règle des
3 échecs/élimination est un **garde-fou d'UI**, pas une contrainte de stockage. Écartés :
surcharger `jumps` par un param (casse l'invariant + ne résout pas la collision), deux enums
`high_jump`/`pole_vault` (mode identique dupliqué), champs `barHeight`/`attempt` dédiés
(redondants avec `distanceMeters`+ordre). Quatre questions ouvertes à trancher avant code.

---

## ADR-26 — Lecture athlète de ses groupes & de son coach (`GET /groups/mine`)

Décision complète : [`docs/adr/ADR-26-lecture-athlete-de-ses-groupes.md`](adr/ADR-26-lecture-athlete-de-ses-groupes.md).

**Statut : Accepté** (validé 2026-06-10 — débloque la section « Mon groupe / Mon coach » + Quitter de TLX-88).

**En bref.** Le backend groupes (TLX-041) n'expose **aucune lecture côté athlète** : `GET /groups`,
`/groups/{id}` et `/groups/{id}/members` sont tous `@Roles('coach')`, et la réponse de `join`
(`GroupMember`) ne porte ni le nom du groupe ni le coach — l'athlète ne peut donc ni afficher son
rattachement ni connaître le `groupId` à quitter. Proposition : endpoint additif **`GET /groups/mine`**
(`@Roles('athlete')`) renvoyant ses groupes **actifs** (`left_at IS NULL` + groupe non supprimé),
chacun enrichi du **résumé coach** et de `joinedAt`, via un schéma dédié **`AthleteGroup`**
(`{ id, name, description?, memberCount, joinedAt, coach: UserSummary }`) **sans `inviteCode`**
(réservé au coach, ADR-16). Enveloppe bornée `{ data }` sans pagination. Dérivation à la lecture,
zéro migration, rétro-compatible. Écartés : élargir `GET /groups` au rôle athlète (fuite potentielle
du code via le schéma `Group` partagé), porter le rattachement dans `GET /users/me` (casse la cohésion
du profil), persistance locale du `join` (perdue à froid).

---

## ADR-27 — Schéma `exercises` v3 : groupes d'exercices (tours / séries / supersets)

Décision complète : [`docs/adr/ADR-27-groupes-d-exercices-tours-series.md`](adr/ADR-27-groupes-d-exercices-tours-series.md).

**Statut : Accepté** (2026-06-11 — spike TLX-95 : validé après audit contre le code,
amendements intégrés au fichier ADR : jointure résultats **`order` d'abord** (les groupes
successifs dupliquent légitimement les noms), **séquencement impératif lecture→écriture**
(aucune vue n'aplatit aujourd'hui ; le constructeur en mode édition perdrait les membres
d'un groupe en rétrogradant v3→v2), extension du masquage TLX-94 (`sets` jamais masqué,
mécanique par type seul), impacts ajoutés : mapper `normalizeBlock`, compteurs
`items.length`, estimation de durée du brief ADR-28, libellés de revue C-08).

**En bref.** La liste plate de blocs (ADR-18) n'exprime pas les regroupements canoniques de
l'entraînement athlétique : séries de courses `2 × (3 × 300) r/R`, complex/contrast training
(supersets force-vitesse), circuits PPG à stations hétérogènes, gammes. Proposition : **v3
additive** introduisant un nœud **`kind: "group"`** à **un seul niveau** (garanti par
construction : `group.items` est typé `Exercise[]`), portant `rounds` (tours), `groupType`
(`superset|circuit|series`, sémantique d'affichage), `restBetweenItemsSeconds` (r) et
`restBetweenRoundsSeconds` (R). `order` global unique sur les feuilles → **`results` v2,
records et progression inchangés** (simple aplatissement de lecture). Composition variable
par tour = **plusieurs groupes successifs** (décision ferme, conforme à l'écriture de
terrain). `sets` masqué pour un exercice en groupe (la série = `rounds`, mécanique TLX-94).
Écartés : statu quo (duplication manuelle des tours — le manque remonté en live), récursion
complète (YAGNI), regroupement par référence `groupKey` (intégrité faible), tours à
composition variable (complexité sans pratique réelle), extension des params `rounds`
mono-bloc (stations hétérogènes impossibles).

---

## ADR-28 — Brief de séance : double lecture coach / athlète

Décision complète : [`docs/adr/ADR-28-brief-de-seance-double-lecture.md`](adr/ADR-28-brief-de-seance-double-lecture.md).

**Statut : Accepté** (2026-06-11 — livré : TLX-98 backend + TLX-99 front, validés en réel).

**En bref.** Le cadrage produit définit la séance comme **une donnée, deux lectures** :
logique d'entraînement côté coach (intention, charge, régression/progression, vigilance),
version épurée et actionnable côté athlète (en une phrase, durée, difficulté, « Réussi
si… » / « Stop si… »). Le moteur de blocs typés (ADR-18/27) couvre la moitié « machine »,
mais la **couche éditoriale n'existe pas** : `Session` ne porte ni intention ni
durée/difficulté (pourtant maquettées dans le kit UI), et l'athlète reçoit la séance
entière — aucun champ coach-only n'est possible. Proposition : document JSONB versionné
**`brief`** sur `sessions` (méthode ADR-10, tout optionnel, zéro migration) — champs
partagés (`athleteIntent`, `durationMinutes`, `difficulty` 1-10, `successCriteria`,
`stopCriteria`) + champs coach (`intent`, `coachNotes{regression, progression, caution}`)
**retirés au serveur** de toute sérialisation athlète (mapper par rôle, précédent
ADR-26). L'objectif (1 ligne) reste la `description` existante ; les phases 🔥/🎯/🧊 sont
**dérivées** des types `warmup`/`cooldown` (pas de champ `phase`) ; la durée absente est
**estimée depuis les blocs** et affichée comme telle (défaut explicite) ; l'intensité par
bloc (`percentVma`, `tempo`) passe par les `params` d'éditeurs (frontend pur, cadre
ADR-18). Écartés : deux textes stockés (désynchronisation), colonnes dédiées, filtrage
côté client (fuite des notes coach), champ `phase`, conventions Markdown dans
`description`.

---

## ADR-29 — Modèles de séance (bibliothèque C-10) : statut `template`

Décision complète : [`docs/adr/ADR-29-modeles-de-seance-bibliotheque.md`](adr/ADR-29-modeles-de-seance-bibliotheque.md).

**Statut : Accepté** (2026-06-12 — débloque TLX-064 / C-10).

**En bref.** C-10 demande une bibliothèque de séances **réutilisables, non datées et non
assignables** côté coach, mais ni la « Carte C-10 » (absente des specs) ni le modèle de
données ne définissent de notion de **modèle** (`SessionStatus` = `draft|published|archived`,
pas de table dédiée). Le `duplicateSession` livré (TLX-050) annonçait déjà des « impacts
modèles C-10 » : la feature est pensée **autour de la duplication**. Décision : un modèle =
une `Session` de statut **`template`** (valeur d'enum additive) — même contenu `exercises`
(ADR-18/27) + `brief` (ADR-28), **zéro table, zéro migration**. Bibliothèque =
`GET /sessions?status=template` (filtre existant) ; « utiliser » = `POST /sessions/{id}/duplicate`
(existant) → brouillon ; « enregistrer comme modèle » = create/update `status: template`.
Seul invariant neuf : **assigner un `template` → 422** (`SESSION_NOT_ASSIGNABLE`) ; la
non-fuite athlète est déjà acquise (scope de lecture = affectation active). Écartés : ressource
dédiée `/session-templates` (≈2× le travail, découplage inutile au MVP, réversible plus tard),
booléen `isTemplate` (états incohérents `published`+template), et « assignation réservée aux
`published` » (règle non spécifiée, hors périmètre).

---

## ADR-37 — Lecture athlète des coéquipiers de son groupe (`GET /groups/{id}/teammates`)

Décision complète : [`docs/adr/ADR-37-lecture-athlete-coequipiers-groupe.md`](adr/ADR-37-lecture-athlete-coequipiers-groupe.md).

**Statut : Accepté** (2026-06-14 proposé · 2026-06-15 accepté & implémenté). Décisions : `sport` exclu de la v1 (minimisation) ; `avatarUrl` inclus (présigné, `User.photo_url` — TLX-124) ; **revue AIPD / notice de confidentialité = suivi non-code** à acter avant mise en production (le livrable lui-même est additif et minimisé).

**En bref.** ADR-26 a donné à l'athlète `GET /groups/mine` (nom, coach, **effectif**) mais a **exclu la liste des membres** ; l'unique endpoint de composition (`GET /groups/{id}/members`) est coach-only. L'athlète voit donc *combien* de coéquipiers, pas *qui*. Proposition : endpoint additif **`GET /groups/{id}/teammates`** (`@Roles('athlete')`, **garde d'appartenance** : membre actif du groupe, 404 sinon) renvoyant les membres actifs via un schéma **dédié et minimisé `GroupTeammate`** (`{ id, firstName?, lastName?, avatarUrl? }`) — **sans** e-mail ni donnée de performance/charge/santé (qui restent consent-gated et coach-scopées). Pas de consentement (rattachement ≠ santé, cohérent ADR-24/26) ; **mais** introduit une **visibilité d'identité pair-à-pair** → mise à jour de la notice de confidentialité + revue **TX-DPIA-007** exigées avant implémentation. Front (sous ADR-26) : carte « Mon groupe » ouvrable → écran `(athlete)/group/[id]` (description + roster + coach + Quitter). Écartés : élargir `/groups/{id}/members` au rôle athlète (schéma partagé fragile), embarquer `teammates[]` dans `/mine` (charge + N+1), exposer des profils riches (minimisation), statu quo (repli si l'AIPD bloque).

---

## ADR-43 — Hub de groupe athlète : présence (RSVP) orthogonale au cycle d'exécution + discipline & perf attendue dérivées

Décision complète : [`docs/adr/ADR-43-hub-de-groupe-athlete-presence-et-derivations.md`](adr/ADR-43-hub-de-groupe-athlete-presence-et-derivations.md).

**Statut : Accepté** (2026-06-20 proposé · 2026-06-20 accepté). Décisions : (1) **présence déclarée** (RSVP) = champ **additif** `attendance ∈ {going,not_going,maybe}|null` (+ `attendanceReason` ssi `not_going`) sur l'affectation, **orthogonal** à `AssignmentStatus` (ADR-31) — n'entre **pas** dans l'assiduité ; écriture par verbe dédié `PUT /assignments/{id}/attendance` (RBAC athlète titulaire, membre actif) ; `attendanceDeadline` dérivée de `dueDate` − délai `.env`. (2) **discipline** de séance **dérivée** des blocs typés (module pur `progress/session-discipline.ts` réutilisant `eventForExercise`, ADR-20) — famille dominante / `mixed` / `none`, **zéro champ, zéro migration**. (3) **« perf attendue »** **dérivée** de la présence d'≥1 bloc mesurable (zéro flag) ; badge **PR** inchangé (ADR-20/32). (4) fil & calendrier athlète sur **`GET /assignments` existant** + regroupement/recherche **client** (Lot 1) ; filtres serveur `from`/`to`/`discipline` **différés Lot 2** (additifs, discipline résolue serveur par la même dérivation). (5) **RGPD** : MVP n'expose que le **compteur agrégé** de présence (« 9 présents · 1 absent · 2 sans réponse ») ; **identités pair-à-pair hors périmètre** tant que la revue **AIPD/TX-DPIA-007** (gabarit ADR-37) ne l'a pas validée — présence nominative restant visible du coach. Écartés : tout mapper sur ADR-31 (`not_going=skipped`), présence booléenne, champ `discipline` ou flag `requiresPerformance` stockés sur `Session`, filtres serveur dès le Lot 1, pile d'avatars nominative en MVP. Débloque la Phase B de TLX-XXX (hub athlète) et TLX-YYY (hub coach).

---

## ADR-44 — Recentrage de l'IA athlète : surface « Séances » unique (liste/calendrier), hub de groupe mince, onglet « Groupe »

Décision complète : [`docs/adr/ADR-44-recentrage-ia-athlete-seances-unifiees-et-groupe-mince.md`](adr/ADR-44-recentrage-ia-athlete-seances-unifiees-et-groupe-mince.md).

**Statut : Accepté** (2026-06-21, validé d'office). **Amende ADR-43 §4.** Constat (test) : l'athlète voit ses séances à 3 endroits — Séances (A-02), Calendrier (A-08), et le hub de groupe (TLX-173) qui re-liste une **copie** du fil (non scopable au groupe en Lot 1, ADR-30) ; et le groupe n'est accessible que via Profil. Cause : asymétrie — athlète **centré séances**, coach **centré groupe**. Décisions : (1) **hub de groupe athlète mince** (Coéquipiers + Infos), retrait des volets Séances/Calendrier + du détail lecture-seule introduits en Phase A ; (2) **fusion Séances + Calendrier** en un onglet « Séances » à bascule **Liste ⇄ Calendrier** réutilisant **A-02/A-08** (compétitions ADR-24 préservées) — pas de calendrier ré-implémenté ; Lot 2 = filtre « par groupe » ici ; (3) **onglet « Groupe »** de premier niveau (sort de Profil) → tab bar **Accueil · Séances · Progression · Groupe · Profil** ; (4) **détail unique** `session/[id]` accueille le **contrôle de présence** (ADR-43 §1), le next-up restant porté par l'Accueil (A-01) ; (5) dérivation discipline (ADR-43 §2/§3) **conservée** → tag de discipline sur la **ligne de séance** (pastilles calendrier différées) ; (6) **confirmation** avant « Quitter le groupe ». Écartés : garder le hub group-scoped (la redondance), fusionner sur les composants TLX-173 (perte de l'intégration compétitions A-08), 6ᵉ onglet (tab bar surchargée).

---

## ADR-45 — Agrégat de présence par séance (compteur sans noms)

Décision complète : [`docs/adr/ADR-45-agregat-de-presence-par-seance.md`](adr/ADR-45-agregat-de-presence-par-seance.md).

**Statut : Accepté** (2026-06-21, validé d'office). **Complète ADR-43 §1/§5.** L'athlète déclarait sa présence sans voir l'élan du groupe ; ADR-43 §5 autorise déjà un **compteur agrégé**. Endpoint **`GET /assignments/{id}/attendance-summary`** (`getAttendanceSummary`) : compte `attendance` sur **toutes les affectations actives partageant le `sessionId`** (fan-out ADR-30) → agrégat **par séance**, **sans** dépendre de la provenance de groupe (Lot 2), **zéro migration**. Réponse = **entiers seuls** `{going, notGoing, maybe, noResponse, total}`, **aucune identité** (RGPD ; nominatif différé à l'AIPD). RBAC = titulaire de l'affectation **ou** coach propriétaire (404 sinon). Front : ligne « X présents · Y absents · Z sans réponse » dans le détail unique (ADR-44 §4), masquée si `total ≤ 1`, rafraîchie à la déclaration (invalidation par préfixe). Écartés : agrégat par groupe (couple au Lot 2), endpoint `/sessions/{id}` (garde dédiée), liste nominative (AIPD).

---

## ADR-46 — Annonces de groupe (coach → membres)

Décision complète : [`docs/adr/ADR-46-annonces-de-groupe.md`](adr/ADR-46-annonces-de-groupe.md).

**Statut : Accepté** (2026-06-21, validé d'office). Donne au hub de groupe athlète (mince, ADR-44) un **canal de communication descendant** : le coach publie une annonce, les membres la lisent et sont notifiés. Table dédiée `group_announcements` (corps texte seul ≤1000, soft-delete, pas de titre/édition au MVP). Contrat : `GET` (coach proprio **ou** membre actif), `POST`/`DELETE` (coach proprio). Notification à la publication : **nouveau type `group_announcement`** (≠ `group_update`), CHECK étendu (migration additive), gardé par la préférence **`groupUpdates`** existante (pas de nouvelle colonne), contenu générique `resourceId = groupId` (ADR-10) → tap = ouvrir le groupe. UI : onglet **Annonces** dans le hub athlète + section Annonces côté coach. Écartés : réutiliser `comments` (scopé séance) ou `group_update` (collision de sens), nouvelle préférence, chat bidirectionnel, PATCH.

---

## ADR-47 — Vue calendrier mensuelle + calendrier de groupe scopé au coach

Décision complète : [`docs/adr/ADR-47-calendrier-mois-et-calendrier-de-groupe.md`](adr/ADR-47-calendrier-mois-et-calendrier-de-groupe.md).

**Statut : Accepté** (2026-06-22, validé d'office). **Amende ADR-44 §1/§2.** Deux manques (test) : pas de **vue mois** (A-08 = semaine seule), et pas de calendrier dans le hub de groupe alors que les **séances du groupe ≠ séances perso** (séance libre `self_logged`, ADR-36). Décisions : (1) composant `SessionsCalendar` partagé **Mois ⇄ Semaine** (helpers purs `calendar-grid.ts` restaurés d'ADR-44, pastilles discipline ADR-43) ; (2) la vue Calendrier de l'onglet Séances passe en **mois** (toutes les séances ; compétitions-entrées différées, lien « Mes compétitions » conservé) ; (3) **onglet « Calendrier » réintroduit dans le hub**, filtré `session.coachId === group.coach.id` → séances **du coach** uniquement (exclut les séances libres de l'athlète), **sans Lot 2** (filtrage client). Hub : Annonces · Calendrier · Coéquipiers · Infos. Limite assumée : approximation par coach (une séance individuelle du même coach apparaît aussi). Écartés : étendre `CalendarView` au mois, scoper par `group_assignment_id` (Lot 2), garder le hub sans calendrier.

---

## ADR-48 — « Mur d'équipe » : interactions de groupe par paliers RGPD

Décision complète : [`docs/adr/ADR-48-mur-d-equipe-interactions-de-groupe.md`](adr/ADR-48-mur-d-equipe-interactions-de-groupe.md).

**Statut : Accepté** (2026-06-23 — trajectoire validée ; Palier 1 livré, Palier 2 cadré par ADR-49). Transforme le hub descendant (annonces, ADR-46) en surface sociale **« Mur »**, livrée en **3 paliers indépendants ordonnés par risque RGPD croissant** : **P1** réactions **agrégées** + accusé de lecture agrégé + pouls d'équipe dérivé + présence narrative (zéro identité de tiers, sans AIPD — livré TLX-184) ; **P2** réactions **nominatives** + kudos de participation (lève l'anonymat → AIPD, ADR-49/TLX-185) ; **P3** fil de discussion bidirectionnel (rouvre ADR-46, modération requise — TLX-186). Invariants transverses : patron d'agrégat par défaut (ADR-45), frontière santé/perf intacte (ADR-08/21 — le social porte sur annonces et **participation**, jamais la perf), réutilisation infra, **un ADR d'exécution par palier**. Écartés : chat d'un bloc, nominatif d'emblée, leaderboard de perf.

---

## ADR-49 — Mur Palier 2 : exécution réactions nominatives + kudos de participation

Décision complète : [`docs/adr/ADR-49-mur-palier-2-reactions-nominatives-et-kudos.md`](adr/ADR-49-mur-palier-2-reactions-nominatives-et-kudos.md).

**Statut : Accepté** (2026-06-23, validé RT — périmètre Option A). Exécute ADR-48 Palier 2. **D1** réactions nominatives : pas de nouvel endpoint, on enrichit la lecture — chaque `reactions[]` gagne `reactors: GroupTeammate[]` (identité minimisée ADR-37, plafond `.env`, avatars présignés best-effort) ; auteurs = co-membres → couverts par TX-DPIA-007 §5.5. **D2** kudos : table `participation_kudos(assignment_id, giver_id)` unique togglable, verbes `PUT/DELETE /assignments/{id}/kudos` (cible = présence `going` d'un coéquipier, axe ADR-43), notif **`group_kudos`** gatée `groupUpdates` (contenu minimal ADR-10). **Invariant dur** : kudos sur la **participation**, jamais la perf/charge/record (ADR-08/21). **D3** conformité : la visibilité de présence pair-à-pair (différée ADR-43 §5) est tracée et validée en **TX-DPIA-007 §5.6**. Repli : désactiver le kudos → réactions nominatives → Palier 1, sans régression. Écartés : endpoint de liste paresseuse par emoji, kudos scopé groupe, kudos sur la perf.

**Amendement — 2026-08-21 (TLX-266) : `resourceId` = l'affectation, pas la séance.** §D2 prescrivait `resourceId` = `sessionId` (« ouvre la séance »). L'athlète qui tapait la notification de kudos obtenait **« Impossible de charger cette séance »** — son seul geste, échouant à tous les coups (mesuré sur appareil, QA-04.6, `resource_id` vérifié en base). Cause : côté athlète **aucune route n'est indexée par identifiant de séance** — celle qui s'appelle `session/[id]` consomme une **affectation** (`getAssignment`). Le nom de la route est le piège, et ADR-49 a écrit « ouvre la séance » en toute bonne foi. `group_kudos` était le **seul** type à émettre une séance, et le seul dont le tap échouait ; tous les autres émettent une affectation. **Décision** : `give()` émet l'`assignmentId` du destinataire — aucun changement de contrat, seule la valeur change. Emporte un **second symptôme invisible** : la clé d'invalidation `['assignment', <sessionId>]` ne visait aucune requête montée, donc l'invalidation au push (TLX-235) était inerte pour les kudos — une mine, pas une panne, la surface de kudos ne montrant que ceux des coéquipiers. **Point de méthode** : commentaire serveur, commentaire client, test et nom de route avaient été écrits sur la même croyance fausse ; le test passait parce qu'il se donnait `'asg-3'` — **un test qui choisit sa donnée d'entrée ne prouve rien sur ce que le système produit**. La garde est désormais côté API, sur la valeur émise, avec une fixture où affectation et séance diffèrent. Les six autres émetteurs ont été relus un par un : tous conformes.

---

## ADR-50 — Mur Palier 3 : fil de réponses sous annonce + modération

Décision complète : [`docs/adr/ADR-50-mur-palier-3-fil-de-reponses-et-moderation.md`](adr/ADR-50-mur-palier-3-fil-de-reponses-et-moderation.md).

**Statut : Accepté** (2026-06-23 — **réouverture d'ADR-46 validée explicitement**, CLAUDE.md §7). Exécute ADR-48 Palier 3. **D1** scope = **réponses sous une annonce** (table `announcement_replies`, texte seul ≤ 500, soft-delete + `deleted_by_id`, tri chronologique) — `comments` (scopé séance) écarté. **D2** RBAC = coach proprio **ou** membre actif, fil **bidirectionnel** (404 anti-énumération). **D3** modération (non négociable) : suppression par l'**auteur** ou le **coach** ; **signalement** (`announcement_reply_reports`, unique `(reply, reporter)`, `reason` borné) ; **masquage automatique** au-delà de `REPLY_REPORTS_HIDE_THRESHOLD` (défaut 3) signalements distincts — masqué aux non-coachs, visible du coach avec `reportCount` ; **anti-spam** `REPLY_MAX_PER_ANNOUNCEMENT_PER_AUTHOR` (défaut 30) → 422 ; **blocage de membre différé**. **D4** RGPD : contenu de pair (coach = responsable éditorial), purge à l'effacement via FK `ON DELETE CASCADE` (ADR-15), auteur au compte clos présenté « Membre » (ADR-37), TX-DPIA-007 §5.7. **D5** notif : **`group_reply`** à l'**auteur de l'annonce** seulement (gate `groupUpdates`, `resourceId = groupId`), pas de fan-out (anti-bruit). Repli : désactiver le fil → retour Palier 2 sans régression. Écartés : `comments`, fan-out groupe, file de modération dédiée, blocage durable au P3.

---

## ADR-51 — Appartenance multi-coach : cloisonnement visibilité & consentement

Décision complète : [`docs/adr/ADR-51-appartenance-multi-coach.md`](adr/ADR-51-appartenance-multi-coach.md).

**Statut : Accepté** (2026-06-24, validé). Permettre à un athlète d'appartenir à des groupes de **coachs différents**. Le modèle le permet déjà (relations M:N, lien par coach) — le blocage actuel est un simple trou d'UX athlète. **Mais** activer le multi-coach naïvement ouvre deux failles : (1) `coach_access` est **global** (un consentement couvrirait tous les coachs) ; (2) les lectures coach (`getForCoach`, stats, records, insights, perfs, commentaires) filtrent sur `{ athleteId }` **sans `coachId`** → un coach verrait les perfs issues des séances d'un **autre** coach (fuite, ADR-08/21). **Décisions proposées :** D1 cardinalité multi-coach (zéro schéma) ; **D2 consentement par coach** (dimension `coach_id`, migration additive, le join vaut consentement) ; **D3 cloisonnement** de toute lecture coach par `session.coachId === coachId` (un coach ne voit ni les données ni l'existence d'un autre coach) ; D4 surface athlète groupée par coach, vue de progression athlète unifiée ; D5 cycle de lien inchangé ; D6 DPIA. **Coût réel = le cloisonnement (D3) + le consentement par coach (D2)**, pas la cardinalité. Repli documenté : « plusieurs groupes, même coach » (correctif front seul, zéro coût D2/D3). Écartés : dossier athlète partagé entre coachs (fuite), consentement global. **Amende ADR-36 §3** (explicité le 2026-08-20, TLX-248) : une séance libre porte `coach_id = athleteId` et échoue au filtre D3 comme la séance d'un autre coach — **le coach ne voit pas l'entraînement libre de son athlète, même consenti**, alors qu'ADR-36 §3 annonçait l'inverse. Non-fuite mesurée en QA-03.8 (cinq lectures coach muettes, témoin positif côté athlète). Le texte d'ADR-36 §3 a été corrigé ; ADR-51 ne citait pas ADR-36 et la reprise était restée tacite.

---

## ADR-52 — Grammaire unifiée « série » pour la création de séance

Décision complète : [`docs/adr/ADR-52-grammaire-unifiee-series-creation-seance.md`](adr/ADR-52-grammaire-unifiee-series-creation-seance.md).

**Statut : Accepté** (2026-06-27, validé d'office par le porteur produit). **Révise ADR-42** (§1 vocabulaire « bloc », §3 repli sur l'éditeur générique). Le `CompositeCanvas` est déjà moderne (chrome de séance + cartes d'effort par segment de discipline) **sauf** deux points : le segment « Personnalisé » retombe sur l'**éditeur brut** `GenericBlocksEditor` (`block-0-type`/`params`), et le vocabulaire « bloc » coexiste avec « série » (dont un **doublon** : la carte = « Série », son champ nb de tours = « Séries »). **D1** hiérarchie de vocabulaire à deux niveaux explicites (révision 2026-06-27) : **Bloc** = unité de premier niveau du canvas composite (« Bloc N · X », « Ajouter un bloc ») ; **Série** = la carte à l'intérieur d'un bloc (« Série N », ×N **Tours**) ; puis les **exercices** — lève le doublon série/série. **D2** champ « nombre de tours » → **« Tours »** dans les 6 cartes + carte générique (renommage de libellé seul, `testID` de contrôle inchangés). **D3** la série **libre** adopte la grammaire carte via un nouveau **`GenericEffortCanvas`** (mêmes primitives `SeriesCardFrame`/`PresetPicker`/`EffortTable`/`CellInput`) avec un **catalogue Type d'effort** (Chronométré · Répétitions · Gainage/PPG · Récup active · Libre), un type pré-sélectionné par défaut, produisant des feuilles **hors des 6 disciplines inférées** (`custom`/`core`) pour rester « libre » au round-trip ; il **remplace** `GenericBlocksEditor` dans le chemin de **création**. **D4** entrée inchangée : 6 raccourcis + carte « Personnalisé » renommée **« Composer une séance »**. **D5** invariants : `EditableNode[]`/`nodesToItems`, **zéro migration / bump `schemaVersion`**, round-trip C-05 ; `GenericBlocksEditor` survit seulement comme repli d'**édition** des `custom` legacy exotiques. Écartés : restyler `type+params` (garde 2 grammaires), supprimer la série libre (perd le hors-discipline), garder « bloc », fusionner le point d'entrée. Plan : TLX-192 (vocabulaire/Tours) · TLX-193 (`GenericEffortCanvas`) · TLX-194 (entrée) · TLX-195 (E2E).

---

## ADR-53 — Onglet « Séances » coach (Liste ⇄ Calendrier)

Décision complète : [`docs/adr/ADR-53-onglet-seances-coach-liste-calendrier.md`](adr/ADR-53-onglet-seances-coach-liste-calendrier.md).

**Statut : Accepté** (2026-06-27, validé). **Amende ADR-44** (asymétrie de nav coach/athlète) et **ADR-47** (calendrier). Constats : le coach **n'a aucune liste de ses séances** (`GET /sessions` n'alimente que calendrier + modèles → une séance non assignée est introuvable, trou TLX-198) ; les **Modèles** sont planqués sous l'onglet Athlètes ; l'athlète a déjà un onglet Séances Liste⇄Calendrier. **D1** barre de nav coach : **Calendrier → Séances** (toujours 4 onglets ; le calendrier devient un sous-onglet). **D2** hub à bascule **Liste ⇄ Calendrier** (SegmentedTabs, `CoachCalendarScreen` embarqué), défaut Liste→À venir. **D3** liste = 4 filtres dérivés de `GET /sessions` (+ `GET /assignments` pour la **date effective** = `scheduledDate` sinon échéance, TLX-195) : **À venir** (≥ aujourd'hui, tri ↑, + publiées sans date en tête tag « Non planifiée ») · **Passées** (< aujourd'hui, tri ↓, retard mis en avant) · **Brouillons** (`draft`) · **Modèles** (`template`, rapatrie `CoachTemplatesScreen`). **D4** bouton « Nouvelle séance » dans le hub + retrait de l'entrée Modèles d'Athlètes. **D5** lot 1 = nav + hub + liste 4 filtres + calendrier ; **lot 2** différé = lignes enrichies (discipline/assignés/retard), recherche/filtre, compteurs. **D6** zéro backend. Écartés : 5ᵉ onglet, liste sous le dashboard, Modèles sous Athlètes, tout livrer d'un coup. Plan : TLX-203 (nav+hub) · TLX-204 (liste) · TLX-205 (enrichissement).

---

## ADR-54 — Entrée unifiée de création séance / modèle

Décision complète : [`docs/adr/ADR-54-entree-unifiee-creation-seance-modele.md`](adr/ADR-54-entree-unifiee-creation-seance-modele.md).

**Statut : Accepté** (2026-06-27, validé). **Complète ADR-38** (entrée par sélecteur de discipline + assistants) et **ADR-29** (modèle = `Session` `status:template`). Constat (test manuel coach, R17) : un modèle est une séance `template`, mais « Créer une séance » ouvre le **sélecteur de discipline** (assistants guidés) tandis que « Créer un modèle » tombe **direct** dans le constructeur brut → les assistants par discipline sont inaccessibles pour les modèles. Le `SessionBuilderScreen` gère **déjà** le mode modèle de bout en bout : le défaut est uniquement sur l'**entrée**. **D1** `NewSessionScreen` devient l'entrée **unique**, paramétrée par `asTemplate` (titre + propagation du statut). **D2** `disciplineAssistantHref`/`customSessionHref` transportent `status=template` ; `newTemplateHref` pointe désormais sur le **picker** (`session/new?status=template`), plus sur le builder. **D3** aiguillage `new.tsx` : `mode=custom` → builder (± template) ; `status=template` seul → picker mode modèle ; défaut → picker mode séance. **D4** la route assistant lit `status` et le forwarde au builder via `initialStatus` → un modèle peut être amorcé par n'importe quel assistant. **D5** zéro backend, zéro contrat, séance/modèle restent éditables C-05 sans perte. Écartés : moderniser seulement le builder de modèle, dupliquer un `NewTemplateScreen`, toggle séance/modèle dans le picker.

---

## ADR-55 — Notifications in-app nominatives (push générique préservé)

Décision complète : [`docs/adr/ADR-55-notifications-in-app-nominatives.md`](adr/ADR-55-notifications-in-app-nominatives.md).

**Statut : Accepté** (2026-06-28, validé). **Amende ADR-10/23** (signal minimal sans donnée métier) et **complète ADR-22**. Constat (R1) : les notifications sont génériques (« Un athlète a rejoint votre groupe ») car le nom n'existe **nulle part** dans la chaîne (payload de file, table `notification`, rendu) — par conception. ADR-10 vise surtout le **canal non maîtrisé** : le **push** (FCM/APNS, écran verrouillé) garde la minimisation ; le **feed in-app** est servi authentifié à un destinataire **déjà autorisé** à connaître le nom. **D1** séparer les canaux : push **inchangé/générique**, feed in-app **nominatif**. **D2** ajouter un `actorId` **optionnel** (file + table), capturé à l'émission (on stocke l'**id**, jamais le nom). **D3** résolution au **read** en batch → DTO `actor?: { id, displayName }` (prénom, minimisé ; optionnel → rétro-compatible). **D4** front : libellés paramétrés par `actor?.displayName` + **repli générique** (anciennes lignes, acteur supprimé). **D5** migration additive (nullable, pas de backfill), push strictement inchangé. Écartés : push nominatif (affaiblit ADR-10), résolution depuis `resourceId` seul (insuffisante pour group_update/kudos/reply), stocker le nom au repos, composer la phrase côté serveur (ADR-23 garde la compo client). Plan : schéma+migration · payload+émission · worker (persistance) · read+DTO+openapi · client régénéré · front+repli · tests unité+intégration.

---

## ADR-56 — react-native-svg pour les graphes riches (progression)

Décision complète : [`docs/adr/ADR-56-react-native-svg-graphes-riches.md`](adr/ADR-56-react-native-svg-graphes-riches.md).

**Statut : Accepté** (2026-06-28, validé). **Rouvre** la décision « courbe sans dépendance » de TLX-212/R9. Constat produit : le sparkline `View` ne se lit pas (seule la meilleure marque chiffrée). **D1** adopter `react-native-svg` (via `expo install`) pour les graphes riches ; 1er usage `ProgressChart` (aire dégradée + **courbe lissée bézier** + tooltip + ligne PB). **D2** web immédiat (react-native-web), **device après rebuild dev-client** (module natif absent de l'APK → crash sinon, cf. TLX-141) → ticket **TLX-141-bis**. **D3** dérivations **pures et testées** (`progress-series.ts` : delta net de fenêtre, delta point↔précédent, modèle de courbe) ; SVG = pur rendu ; **unité/sens-aware** (`formatRecordValue` + `direction`) → zéro cas par discipline. **D4** UX par divulgation progressive : bandeau **progression** (delta coloré par le sens) → courbe + **point sélectionnable** (tooltip date/valeur/Δ, ligne PB, repères) → **bandeau de marques** scrollable (journal lisible) → **adaptatif** (1 marque = grand chiffre, 2 = avant→après, 3+ = courbe). **D5** zéro backend ; cloisonnement coach (ADR-51/36) inchangé. Écartés : rester en View, lib de charts clé en main, rendu serveur.

---

## ADR-57 — Destination du lien de réinitialisation : site public minimal

Décision complète : [`docs/adr/ADR-57-destination-lien-reinitialisation.md`](adr/ADR-57-destination-lien-reinitialisation.md).

**Statut : Accepté** (2026-08-19, validé). Constat **QA-01.5** : le backend de réinitialisation est conforme (202 neutre, jeton haché à usage unique, email délivré) mais le parcours est **impraticable** — aucune UI dans `apps/mobile` (la maquette O-02 prévoit pourtant le lien) et le lien pointe sur l'hôte API, donc **404 JSON**. **D1** la récupération doit fonctionner **sans l'app** (téléphone changé, réinstallation, ordinateur) : une page web est le socle, pas une option. **D2** **site public statique minimal** sur le domaine principal, servi par le Nginx déjà déployé — `/reset-password`, `/privacy`, `/support` ; `APP_PUBLIC_URL` cesse de désigner l'API. **D3** justifié deux fois : `talent-x.app` ne résout pas aujourd'hui, et TLX-77 est bloqué sur l'exigence « politique de confidentialité en URL publique » des deux stores — une seule infrastructure, deux problèmes résolus. **D4** hébergement en UE chez nous (cohérence TX-SEC-003) ; jeton **nettoyé de l'URL** (il transite en query string → historique et journaux d'accès), **aucun script tiers**, `Referrer-Policy: no-referrer` conservé, origine à ajouter au **CORS**. **D5** écrans de **demande** dans l'app (lien O-02 déjà maquetté) avec message **neutre** — le 202 anti-énumération du serveur ne vaut rien si l'écran révèle l'existence du compte. Écartés : lien profond seul (souvent non cliquable en mail, inopérant sans app installée), build web Expo complet (exposerait toute l'app, canal produit non décidé), page servie par l'API (la moins chère, mais ne fait rien pour TLX-77 et garde un lien en `api.`), hébergeur statique tiers (sous-traitant hors UE pour servir la politique de confidentialité). **Différés** : App Links / Universal Links — la page web reste le repli, ce travail n'est jamais perdu.

---

## ADR-58 — États locaux des écrans d'onglet masqués : remontage par `key` de route

Décision complète : [`docs/adr/ADR-58-remontage-par-cle-ecrans-onglet-masques.md`](adr/ADR-58-remontage-par-cle-ecrans-onglet-masques.md).

**Statut : Accepté** (2026-08-20, validé). Les écrans `Tabs.Screen … href: null` ne sont **jamais démontés** : `useState` n'est évalué qu'une fois et changer de paramètre de route ne remonte rien, donc l'état d'une ressource fuit vers la suivante. Trois manifestations en trois jours — **TLX-236** (mode de saisie), **TLX-239** (bascule de vue, puis **RPE et notes de la séance précédente** pré-remplissant le formulaire : une donnée fausse attribuée à quelqu'un), **TLX-245** (confirmation de suppression rouverte sur la séance suivante, action **destructrice** mal ciblée). **C1** l'inventaire donne **13 routes paramétrées, 1 seule protégée** (`assign/[id]`, `key={id}` posé pour ce motif dès TLX-93) ; restent notamment le récapitulatif d'engagement de compétition, l'onglet des hubs de groupe et les formulaires d'édition. **C2** le dépôt porte déjà **trois remèdes différents** appliqués au cas par cas — `key` de route, `useFocusEffect`, ref de rendu — donc le problème n'est pas d'ignorer la solution mais de n'en avoir aucune comme règle. **D** la `key` dérivée du paramètre devient la règle **par défaut**, au fichier de route (petit, il connaît le paramètre, vérifiable d'un coup d'œil) ; exemption possible si un état doit réellement survivre, à justifier en commentaire — aucun écran ne remplit la condition aujourd'hui. **Prémisse corrigée** : TLX-239 craignait la perte du brouillon hors ligne (TLX-077) ; vérifié, il est persisté sur l'appareil et rechargé par un effet sur `[id]`, donc un remontage le relit. Écartés : statu quo par état (trois tickets en trois jours, rouvert à chaque `useState` ajouté), `useFocusEffect` (s'exécute après la peinture → éclair de l'état précédent), ref de rendu (correcte mais ne protège que ce qu'on a pensé à énumérer — c'est ainsi que `rpe`/`notes` ont échappé à TLX-236), passage à une vraie pile de navigation (correctif de fond, mais touche toute la navigation des deux rôles — son propre ADR).

**Amendement — 2026-08-21 (TLX-257) : la portée de la règle.** `(coach)/assign/[id]`, **seule route déjà protégée** avant l'ADR, échouait quand même : après une affectation réussie, revenir sur **la même** séance rouvrait la confirmation précédente et le coach ne pouvait plus jamais l'affecter à personne d'autre (QA-02.4, sur appareil). `key={param}` garantit qu'aucun état de la ressource A ne s'affiche sur B ; elle ne garantit **pas** qu'une entrée reparte d'un état neuf, la clé ne changeant pas quand on revient sur la même ressource. **Règle complémentaire** : un écran hébergeant un parcours à **état terminal** (confirmation, récapitulatif de succès) doit, en plus de sa `key`, remettre ce parcours à zéro **à la reprise du focus** — à l'entrée et non à la sortie (les sorties sont multiples : Terminé, Retour, bouton matériel, geste ; l'entrée est unique), et **seulement après un parcours terminé** (sinon un simple aller-retour effacerait une sélection en cours), le drapeau vivant dans une `ref` et non un `state`. `routes-key.test.ts` est structurellement aveugle à cette famille : la clé est bien présente. **Reste ouvert** : `(coach)/competition/[id]/engage` a la même forme (`confirmedNames` + `onDone` qui navigue seulement), non traité dans TLX-257.

---

## Gabarit pour un nouvel ADR

```markdown
## ADR-XX — Titre court de la décision

- **Statut :** Proposé | Accepté | Déprécié | Remplacé par ADR-YY
- **Date :** AAAA-MM-JJ
- **Réf. :** documents et sections concernés

**Contexte.** Le problème, les forces en présence, les contraintes.

**Décision.** Ce qui est décidé, en une ou deux phrases claires.

**Conséquences.**
- Positives : …
- Négatives : …

**Alternatives considérées.** Les options écartées et la raison de leur rejet.
```

*Règle : ne jamais modifier une décision actée en place. Pour revenir dessus, créer un nouvel ADR et passer l'ancien en `Remplacé par ADR-YY`.*
