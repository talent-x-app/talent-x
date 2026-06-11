## ADR-29 — Modèles de séance (bibliothèque C-10) : statut `template` plutôt qu'une ressource dédiée

- **Statut :** Accepté (validé 2026-06-12)
- **Date :** 2026-06-12
- **Réf. :** TLX-064 / Linear TLX-49 (« Bibliothèque de modèles de séance, C-10 ») · Carte C-10 · TX-DATA-006 §5.4 / §9 (séances, JSONB) · TX-SPEC-002 §5 (modèle fonctionnel séances/affectations) · §6 (autorisation) · `talent-x-openapi.yaml` (`Session`, `SessionStatus`, `POST /sessions/{id}/duplicate`) · ADR-18/27 (schéma `exercises`) · ADR-28 (brief) · TLX-050 (séances livrées)

**Contexte.** C-10 demande, côté **coach**, une **bibliothèque de modèles de séance** : des séances
réutilisables, **non datées** et **non assignables**, à partir desquelles créer une vraie séance
(brouillon) en un geste, et l'inverse (« enregistrer comme modèle » depuis une séance existante).
Or la « Carte C-10 » n'est détaillée nulle part dans `docs/` (seulement citée au backlog), et la
notion de **modèle/template** n'existe **ni au contrat OpenAPI ni au modèle de données** :
`SessionStatus` = `draft | published | archived`, aucune table `session_templates`. On ne peut donc
pas « implémenter conformément à la référence » sans d'abord trancher *comment* un modèle est
représenté — décision structurante que les specs ne tranchent pas (CLAUDE.md §7) → ADR avant code.

Indice de conception : le `duplicateSession` déjà livré (TLX-050) porte le commentaire
« *impacts modèles C-10* » et duplique aussi le `brief` (ADR-28) — la fonctionnalité a été pensée
**autour de la duplication**, pas d'une ressource séparée.

**Décision.**

### 1. Un modèle = une séance de statut `template` (pas une ressource distincte)

Ajouter une valeur à l'enum `SessionStatus` : `draft | published | archived | **template**`. Un
**modèle** est une `Session` de statut `template`, propriété du coach, **non datée** (`scheduledDate`
nul). Il porte exactement le même contenu qu'une séance — `exercises` (v3, ADR-18/27) et `brief`
(ADR-28) — donc **zéro nouvelle table, zéro nouveau schéma de contenu, zéro migration de données**.
C'est l'extension additive minimale, dans la lignée des ADR-18/19/25.

### 2. Surface de contrat — additive

- **`SessionStatus`** (OpenAPI → DTO Nest → client orval) gagne `template`. Rétro-compatible (valeur
  ajoutée, aucune retirée).
- **Bibliothèque** = `GET /sessions?status=template` : le filtre `status` (role-aware coach) **existe
  déjà** (TLX-050) → aucun nouvel endpoint de lecture.
- **« Utiliser ce modèle »** = `POST /sessions/{id}/duplicate` : **existe déjà**, crée une copie en
  `draft` non datée (le titre « (copie) » sera ajusté côté front). On part de la copie pour dater,
  ajuster et publier/assigner — le modèle reste intact.
- **« Enregistrer comme modèle »** = `POST /sessions` ou `PUT /sessions/{id}` avec
  `status: template` (chemins existants).

### 3. Invariant nouveau : un `template` n'est pas assignable

C'est le **seul** garde-fou réellement neuf. Aujourd'hui `AssignmentsService.assign` ne vérifie que
l'ownership de la séance, pas son statut. On ajoute : **assigner une séance de statut `template`
→ 422** (`SESSION_NOT_ASSIGNABLE`). Un modèle n'a pas vocation à être exécuté ; il doit d'abord être
dupliqué en séance réelle. (Les statuts `draft`/`published`/`archived` restent assignables comme
aujourd'hui — l'ADR ne réintroduit pas de règle « publié seulement » non spécifiée.)

### 4. Pas de fuite côté athlète — déjà neutralisé

Le scope de lecture athlète des séances exige une **affectation active**
(`assignments: { some: { athleteId, deletedAt: null } }`, TLX-050) ; et l'invariant §3 empêche
d'affecter un modèle. Un `template` est donc, par construction, **invisible de tout athlète** sans
règle supplémentaire. La matrice TX-SPEC-002 §6 est inchangée (les modèles relèvent de la ligne
`sessions.*` = coach propriétaire).

### 5. Placement & implémentation

- **Backend** : valeur d'enum (`session-create.dto.ts` + OpenAPI `SessionStatus`) ; garde §3 dans
  `AssignmentsService.assign` (lecture du statut de la séance avant création de l'affectation) ;
  tests unitaires (assignation d'un modèle → 422) + intégration (round-trip création modèle →
  liste `?status=template` → duplicate → assign de la copie OK / assign du modèle refusé).
- **Front (C-10)** : écran « Mes modèles » (coach) consommant `GET /sessions?status=template`
  (clé de cache dédiée), entrées « Utiliser » (→ `duplicate` → ouvre le constructeur sur la copie)
  et, depuis le constructeur (C-05), bascule « Enregistrer comme modèle » (statut). Réutilise les
  composants `session-builder-ui` / listes de séances existants.

**Conséquences.**

- Positives : **additif** et rétro-compatible (une valeur d'enum + un garde) ; réutilise `duplicate`
  (déjà prévu pour C-10) et le filtre `status` existants ; **zéro migration**, zéro nouveau schéma de
  contenu ; pas de duplication de la logique `exercises`/`brief` ; pas de fuite athlète à coder.
- Négatives : `template` cohabite dans la table `sessions` avec les séances réelles — les requêtes de
  pilotage (dashboard, calendrier coach) doivent **exclure** les modèles si elles ne filtrent pas
  déjà par statut (à vérifier : C-09 calendrier coach liste `GET /sessions` sans filtre → exclura
  `template`). Surface de test du garde d'assignation en plus.

**Alternatives considérées.**

- **Option B — ressource dédiée `session_templates` + `/session-templates` CRUD** (table, DTO,
  endpoints, client orval, migration) : rejetée — ~2× le travail et la surface de contrat, duplique
  toute la logique `exercises`/`brief` et la validation, pour un découplage dont le MVP n'a pas
  besoin. Réversible : si un modèle devait diverger d'une séance (variables, paramétrage), une
  ressource dédiée pourra être introduite plus tard sans rupture.
- **Champ booléen `isTemplate` plutôt qu'un statut** : rejeté — un modèle est mutuellement exclusif
  de `draft`/`published`/`archived` (il n'est pas « un brouillon qui est aussi un modèle ») ; le
  modéliser comme statut évite les états incohérents (`published` + `isTemplate`) et réutilise
  directement le filtre `status` et le scope existants.
- **Réserver l'assignation aux séances `published`** : écarté — règle non spécifiée, hors périmètre
  de cet ADR ; on se borne à interdire l'assignation des `template`.
