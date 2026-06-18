# ADR-42 — Création/édition de séance « Personnalisé » en **canvas composite par bloc** (cartes dédiées par segment)

- **Statut :** Accepté (2026-06-17)
- **Date :** 2026-06-17
- **Complète :** ADR-38 (assistants par discipline), ADR-39 (cartes d'effort dédiées), ADR-40
  (cartes en édition par inférence + repli générique avec bandeau), ADR-41 (carte Renforcement /
  PPG qui partitionne déjà son canvas en segments Muscu/PPG), ADR-18/27 (`exercises` v2/v3)
- **Réf. :** décision produit (2026-06-17) « la création Personnalisé doit adopter la même
  logique que les assistants par discipline » → Option A « canvas composite par bloc » validée,
  CLAUDE.md règle 7 (divergence structurante vis-à-vis d'ADR-40 → ADR avant code)
- **Tickets liés :** nouveaux TLX-176→179

## Contexte

ADR-40 a posé : en **édition**, une séance **mono-discipline** ouvre sa carte dédiée ; toute
séance **mixte/hétérogène** retombe sur l'**éditeur générique C-05** (rendu brut des blocs) avec
un bandeau « Édition avancée ». La **création « Personnalisé »** part, elle aussi, du générique.

Constat produit : c'est incohérent une fois les 6 cartes livrées (ADR-41). Une séance qui combine
plusieurs disciplines (cas réel : sprint + muscu en complément, ou écha PPG + corps haies) perd
tout le confort des cartes bespoke. Décision validée : la séance Personnalisé doit **réutiliser
les cartes par discipline**, une par **bloc** de la séance.

**Observation clé** : la carte Renforcement (ADR-41) **fait déjà exactement ça** — elle découpe
un canvas plat en **segments homogènes** (runs de blocs `strength` = cartes Muscu, groupes `core`
= cartes PPG) et rend chacun avec son sous-rendu. On **généralise ce mécanisme à l'échelle de la
séance** : un canvas composite découpe la liste de nœuds en segments par discipline inférée et
rend chaque segment avec la carte d'effort correspondante.

## Décision

### 1. Le « Personnalisé » devient un **canvas composite** (zéro nouveau modèle de données)

- La séance reste une **liste `EditableNode[]`** identique (aucun champ `discipline` stocké,
  invariant ADR-38/40). Les « blocs » sont une **dérivation d'affichage** : on segmente la liste
  en **runs contigus de même discipline inférée** (réutilise `inferDiscipline` appliqué nœud par
  nœud — même logique qu'ADR-40/41, factorisée).
- `CompositeCanvas` possède le **chrome de séance** : en-tête résumé live (réutilise
  `sessionPhrase`/KPIs globaux), **barres échauffement / retour au calme** (extraites par
  `splitEffortNodes` au niveau séance), et le sélecteur **« + bloc »**.
- Chaque segment est rendu par la **carte de sa discipline**, alimentée par **sa tranche de
  nœuds** ; l'`onChange` de la carte **réinsère** la tranche modifiée à sa position dans la liste
  complète. Round-trip garanti (`nodesToItems` inchangé — un composite produit une séance
  normale).

### 2. Cartes en **mode encart** (`embedded`) — additif, défaut inchangé

Les 6 cartes (`SprintEffortCanvas` … `StrengthEffortCanvas`) reçoivent une **prop optionnelle**
(`embedded?: boolean`, défaut `false`) :

- `embedded` masque l'**en-tête KPI** de la carte et les **barres échauffement/retour au calme**
  (gérées au niveau séance par le composite) ; la carte rend alors **uniquement ses séries** +
  son bouton « + série » et son sélecteur de preset.
- Défaut `false` = comportement **standalone strictement inchangé** (assistant mono-discipline
  d'ADR-39/41) → aucune régression. Prop additive, testée des deux côtés.

### 3. Sélecteur « + bloc » et gestion des blocs

- **« + bloc »** ouvre un choix parmi les **6 disciplines** + **« Personnalisé »**. Sélection →
  on **append** au canvas le **seed** de la discipline (`assistantSeed`, **sans** ses
  warmup/cooldown qui sont au niveau séance) ; un nouveau segment apparaît.
- **« Personnalisé »** (bloc inclassable) = un segment rendu par l'**éditeur de bloc générique
  existant** (le rendu C-05 actuel, **réutilisé** comme rendu de segment, pas supprimé) : c'est
  le **repli** voulu pour un bloc non couvert par une carte (`custom`, structure exotique).
- **Réordonner / supprimer un bloc** = déplacer/retirer la **tranche** correspondante dans la
  liste (boutons ▲▼🗑 au niveau segment, en plus du réordonnancement des séries **dans** une
  carte qui reste interne à la carte).

### 4. Routage création + édition (révise le repli d'ADR-40)

- **Création « Personnalisé »** → ouvre un `CompositeCanvas` vide.
- **Édition** (hydratation d'une séance existante) :
  1. `inferDiscipline(nodes) != null` → **carte dédiée plein écran** (ADR-40, inchangé).
  2. sinon, **tous** les blocs significatifs sont de disciplines reconnues (mélange seulement) →
     **`CompositeCanvas`** *(nouveau — remplace le repli générique + bandeau d'ADR-40 pour ce
     cas)*.
  3. sinon (présence d'au moins un bloc `custom`/non reconnu) → `CompositeCanvas` **aussi**, le(s)
     bloc(s) non reconnus étant rendus en segment **« Personnalisé »** (générique embarqué).
  - L'**éditeur générique C-05 plein écran** d'ADR-40 n'est donc plus une destination de premier
    plan : il **survit** uniquement comme **rendu du segment « Personnalisé »** à l'intérieur du
    composite. Le **bandeau « Édition avancée »** d'ADR-40 disparaît (le composite explicite
    déjà la structure, bloc par bloc).

## Conséquences

- **+** Cohérence totale : toute séance (mono, mixte, ou avec blocs libres) s'édite avec les
  cartes dédiées, segment par segment. Fin de la rupture « belle carte vs éditeur brut ».
- **+** **Zéro nouveau modèle de données / contrat / migration** : segmentation = affichage,
  round-trip via `nodesToItems`. Réutilise `inferDiscipline`, `splitEffortNodes`, `assistantSeed`,
  les 6 cartes et le rendu générique existant.
- **+** Le mécanisme de partition est **déjà prouvé** par la carte Renforcement (ADR-41).
- **−** Refactor transverse : prop `embedded` sur 6 cartes (bounded, additif). Risque de
  régression mitigé par défaut `false` + tests des deux modes.
- **−** Deux niveaux de réordonnancement (blocs au niveau séance vs séries dans une carte) à
  rendre lisibles en UI — soin d'ergonomie requis (icônes/zones distinctes).
- **−** Le segment « Personnalisé » embarque l'éditeur générique : deux styles visuels coexistent
  dans un même écran (cartes dédiées vs bloc brut). Accepté — c'est le repli explicite voulu.

## Alternatives écartées

- **Pile de cartes sans repli générique** (Option B). Rejeté : perd le filet pour les blocs
  vraiment inclassables (`custom`) ; le porteur produit a retenu le repli « Personnalisé ».
- **Restyler l'éditeur générique** (Option C). Rejeté : cosmétique, n'apporte pas « la logique
  des assistants ».
- **Stocker la discipline par bloc / un type de séance composite.** Rejeté : touche le contrat et
  impose une migration ; la segmentation dérivée suffit (cohérent ADR-38/40/41).
- **Extraire un sous-composant `SeriesList` par carte** (au lieu de la prop `embedded`). Plus pur
  mais 6 refactors plus lourds ; la prop `embedded` atteint le même but à moindre risque.

## Plan (tickets — additifs, testés)

1. **TLX-176 (mobile — cartes)** — prop `embedded` sur les 6 `*EffortCanvas` (masque en-tête KPI
   + barres écha/RAC ; défaut inchangé) + tests des deux modes.
2. **TLX-177 (mobile — composite)** — `CompositeCanvas` : segmentation par discipline inférée,
   chrome de séance (en-tête + écha/RAC), sélecteur « + bloc » (6 disciplines + Personnalisé),
   réordonnancement/suppression de blocs, segment « Personnalisé » via rendu générique embarqué +
   tests.
3. **TLX-178 (mobile — routage)** — création « Personnalisé » → composite ; édition : mélange
   reconnu **et** présence de blocs `custom` → composite (révise le repli d'ADR-40, retire le
   bandeau) ; carte mono-discipline plein écran conservée + tests.
4. **TLX-179 (E2E)** — Playwright : créer une séance Personnalisé (bloc Sprint + bloc Muscu +
   bloc Personnalisé), sérialiser, rouvrir en édition → mêmes segments, round-trip vérifié.

Chaque ticket reste additif, sans migration ni bump de `schemaVersion`.
