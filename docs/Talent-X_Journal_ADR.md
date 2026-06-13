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
| ADR-34 | **Saison vs carrière** — SB (season best) & **marques par année**, **dérivés** des performances (méthode ADR-21, zéro table/migration/endpoint) : **saison = année civile** (split indoor/outdoor **écarté** — aucune donnée de lieu, marques surtout d'entraînement → date trompeuse ; différé à TLX-119) ; exposition **additive sur `ProgressSeries`** (`seasonBest` + `marksByYear[]`), le **PB reste à `personal_records`** (revendiqué, pas agrégé), alignement PB↔SB par la **même `eventKey`** ; miroir coach gratuit (dérivation partagée `derive`, TLX-112) ; RGPD inchangé (rien de neuf persisté) (complète ADR-20/21 · OpenAPI `ProgressSeries` · TLX-114) | Accepté |
| ADR-33 | Historisation des **corrections de performance** (RB-06) : `updatePerformance` écrasait en place → chaque correction écrit désormais une trace **`audit_log`** (`action='performance.correction'`, `metadata={before,after}`, acteur athlète) **dans la même transaction** que l'update (trace aussi durable que la modification). **Zéro migration**, zéro contrat. Choisi contre une table `performance_revisions` (surdimensionnée pour une *trace*). Vue coach de l'historique **différée** (conformité, pas fonctionnalité) ; **records ADR-20 inchangés** (une correction ne mute jamais un PB — souveraineté athlète) ; purge RGPD (ADR-15) **étendue** pour neutraliser le `metadata` des corrections à l'effacement du compte (complète RB-06 · TX-DATA-006 `audit_log` · ADR-15/20 · TLX-110) | Accepté |

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
