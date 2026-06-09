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
| ADR-18 | Schéma `exercises` v2 : blocs typés par discipline, union discriminée (raffine ADR-10 · complète TX-DATA-006 §9.1) | Proposé |

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

**Statut : Proposé** (à valider avant de coder TLX-053→061).

**En bref.** Le contrat `exercises` v1 (TX-DATA-006 §9.1, ADR-10) décrit des blocs
**génériques** sans `type` ; les éditeurs typés C-05 (haies, sauts, intervalles…)
exigent des champs absents, rejetés par le backend (`forbidNonWhitelisted` → 400).
Proposition : **v2 en union discriminée additive** — champ `type` (`BlockType`), base
commune = champs v1, objet `params` validé selon `type` pour les champs propres à la
discipline, `schemaVersion: 2`. **Rétro-compatible** (un bloc sans `type` = `custom`) :
l'éditeur générique livré par TLX-052 devient une variante, **zéro rework**. Débloque le
pré-remplissage A-04 (TLX-062) que le texte libre `notes` ne permettait pas.

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
