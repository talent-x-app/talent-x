# ADR-25 — Grille de barres : saisie des sauts verticaux (hauteur / perche)

- **Statut :** Accepté
- **Date :** 2026-06-10 (validé 2026-06-10)
- **Complète :** `talent-x-openapi.yaml` (enum `BlockType`), `Talent-X_06_Modele_de_donnees.md`
  §9.1 (taxonomie des blocs typés). **N'ajoute aucun champ à `results`** (réutilise le v2).
- **Tickets liés :** TLX-075 (saisie mode Grille de barres, A-04 §4.4) — **bloqué par cet ADR**.
- **Réf. :** CLAUDE.md règles 5 et 7 ; **ADR-18** (blocs `exercises` typés, le mode dérive du
  `type`), **ADR-19** (`results` v2 : `distanceMeters`/`failed` par essai — §Conséquences avait
  renvoyé la grille de barres à cet ADR), **ADR-20** (records : clé d'épreuve dérivée du bloc).

## Contexte

TLX-075 est le **dernier mode de saisie A-04** (072/073/074 livrés). La grille de barres couvre
le **saut en hauteur** et le **saut à la perche** : l'athlète tente des **barres successives**,
**3 essais maximum par barre**, est **éliminé après 3 échecs consécutifs**, et le résultat est la
**barre la plus haute franchie**. Trois contraintes du modèle actuel bloquent :

1. **Le mode de saisie dérive du `type` du bloc** (invariant ADR-18/19 — « pas de discriminant dans
   `results` »). Or **aucun `BlockType` ne désigne un saut vertical** : `jumps` couvre les sauts
   **horizontaux** (longueur/triple — `approachMeters`/`fullJumps`/`plyoContacts`, mesure = distance
   par essai). Un param ne peut pas commuter le mode sans casser l'invariant.
2. **Collision d'épreuve (ADR-20)** : `record-detection` mappe `jumps` → eventKey `jumps`, `max
   distanceMeters`. Une barre franchie à **1.85 m** entrerait en collision avec une longueur à
   **6.42 m** sous la même clé — records faux.
3. **Pas de convention de stockage** de la grille (barres × essais) actée — ADR-19 §Conséquences :
   *« soit une convention (`distanceMeters` = hauteur + `failed` par tentative), soit un complément
   — à trancher avec TLX-075. »*

## Décision (proposée)

### 1. Un nouveau `BlockType` : `vertical_jumps` (« Hauteur / Perche »)

Parce que le mode de saisie **doit** dériver du type (ADR-18/19), on **ajoute une valeur d'enum**
`vertical_jumps` plutôt que de surcharger `jumps` par un param. Un seul type couvre hauteur **et**
perche (comme `jumps` regroupe les sauts horizontaux) ; l'**épreuve précise** est portée par un
param `discipline ∈ {high, pole}`, exactement comme `sprint:{distance}` ou `throws:{implementKg}`
distinguent l'épreuve au sein d'un type. Extension **additive** de l'enum (méthode ADR-18) :
OpenAPI → DTO Nest → client orval régénéré ; un bloc sans `type` reste `custom` (rétro-compat).

**Params du bloc** (conteneur libre `params`, lecture défensive, cohérents avec `heightCm` des haies) :

| Param | Sens | Unité |
|-------|------|-------|
| `discipline` | `high` (hauteur, défaut) \| `pole` (perche) | — |
| `startHeightCm` | barre de départ (pré-remplit la 1ʳᵉ ligne de la grille) | cm |
| `incrementCm` | montée entre barres (pré-remplit les lignes suivantes) | cm |

Les cm (coach) sont convertis en **m** pour la grille et le stockage (cohérent avec `distanceMeters`).

### 2. Stockage : `results` v2 **inchangé** — chaque essai = un `SetResult`

La grille de barres est une **affordance de saisie côté client** ; sa sérialisation produit des sets
v2 ordinaires (aucun champ ajouté à `SetResult`/`ResultsDoc`) :

- **un `SetResult` par essai marqué** : `distanceMeters` = hauteur de la barre **en m** (ex. 1.85),
  `failed` = essai manqué (`true`) / franchi (`false`), `set` = ordre global de l'essai ;
- les cellules **non tentées** ne produisent pas de set ;
- la **barre franchie** = `max distanceMeters` parmi les essais `failed === false` — soit
  **exactement** ce que calcule déjà `bestMeasuresByEvent` (ADR-20, qui ignore `failed`).

La grille est **reconstructible** à la relecture (réhydratation MAJ, revue C-08) : les essais de même
`distanceMeters` appartiennent à la même barre, l'ordre des `set` préserve la séquence. La règle des
3 échecs consécutifs / élimination est un **garde-fou d'UI** (assistance de saisie), **pas** une
contrainte de stockage : le document n'enregistre que les essais réellement effectués.

### 3. Records (ADR-20) : nouvelle branche, plus de collision

`eventForExercise` gagne un cas `vertical_jumps` → eventKey **`vertical:high`** / **`vertical:pole`**
(d'après `discipline`, défaut `high`), `unit: 'm'`, `direction: 'max'`. `bestMeasuresByEvent` est
inchangé (max `distanceMeters` non-`failed`). La collision avec `jumps` disparaît.

## Conséquences

- **+** Clôt la série des modes A-04 (072→075) **sans toucher au contrat `results`** : un seul ajout
  d'enum, méthode additive éprouvée (ADR-18). La progression (A-06) et les records (A-07) intègrent
  hauteur/perche gratuitement via le nouveau eventKey.
- **+** Symétrie cible ↔ saisie préservée : le coach fixe barre de départ + montée → la grille de
  l'athlète se pré-remplit (continuité TLX-062), comme `interval.reps` pré-remplit les lignes de temps.
- **+** Lecture défensive de bout en bout : params manquants → grille vide ajoutable ; aucun essai →
  `completed: false` (v1), jamais d'exception.
- **−** Un `BlockType` de plus à maintenir (registre `BLOCK_TYPE_SPECS`, `entryModeFor`,
  `record-detection`, `exercise-target`) + un **mode de saisie `bars`** dans `perf-entry.ts` (le plus
  gros du ticket : grille barres × 3 essais, élimination, ajout de barre, réhydratation/regroupement).
- **−** La revue coach (`formatMeasures`) gagne un chemin « grille » (barre franchie + résumé), sinon
  la liste à plat des essais serait bruitée.
- **−** Hauteur en **cm** côté params coach (précédent haies) mais en **m** côté grille/mesure : une
  conversion à documenter (déjà le cas mental du formateur de cibles).

## Alternatives écartées

- **Surcharger `jumps` + param `discipline`/`bars`** (zéro enum) : casse l'invariant « le mode dérive
  du type » (ADR-18/19) — le mode dépendrait d'un param libre — et **ne résout pas** la collision
  d'épreuve records. Rejetée.
- **Deux valeurs d'enum `high_jump` + `pole_vault`** : duplique un mode de saisie identique ;
  l'épreuve précise se distingue déjà finement par param (comme `sprint:{distance}`). Rejetée au
  profit d'un type-famille + param, cohérent avec le reste de la taxonomie.
- **Ajouter `barHeightMeters` + `attempt` à `SetResult`** (grille explicite dans le contrat) :
  redondant — `distanceMeters` porte déjà la hauteur, l'ordre des `set` la séquence ; alourdit le
  contrat `results` pour une info dérivable. Rejetée (réutilisation v2, zéro changement de contrat).
- **Stocker la barre franchie seule** (un set = le record du jour) : perd la grille (essais, ratés,
  montée) → revue C-08 et analyse appauvries, non requêtable. Rejetée.

## Questions ouvertes (à trancher avant code)

1. **Un type `vertical_jumps` + param `discipline`** vs deux enums `high_jump`/`pole_vault` —
   recommandation : un type + param (cohérence taxonomie, mode unique).
2. **Réutilisation `distanceMeters`+`failed` sans toucher `results`** vs champs dédiés —
   recommandation : réutilisation (zéro changement de contrat).
3. **Hauteurs en cm (params coach) → m (grille/stockage)** — recommandation : oui (précédent `heightCm`).
4. **Élimination 3 échecs = garde-fou d'UI** (storage = essais bruts) — recommandation : oui.
