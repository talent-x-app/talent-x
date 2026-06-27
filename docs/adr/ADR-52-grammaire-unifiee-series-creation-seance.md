# ADR-52 — Grammaire unifiée « série » pour la création de séance (atelier multi-discipline + carte d'effort générique)

- **Statut :** Accepté (2026-06-27)
- **Date :** 2026-06-27
- **Complète / révise :** **ADR-42** (canvas composite « Personnalisé ») — révise son **§1**
  (vocabulaire « bloc ») et son **§3** (repli sur l'éditeur générique brut). Complète ADR-38
  (assistants par discipline), ADR-39 (cartes d'effort dédiées), ADR-41 (carte Renforcement / PPG),
  ADR-18/27 (`exercises` v2/v3).
- **Réf. :** décision produit (2026-06-27) « la création personnalisée doit suivre **exactement** la
  même logique que les assistants, et parler de **séries**, pas de **blocs** » → validée d'office par
  le porteur produit. CLAUDE.md règle 7 (révision structurante d'ADR-42 → ADR avant code).
- **Tickets liés :** nouveaux TLX-192→195.

## Contexte

ADR-42 a unifié la création « Personnalisé » sur un **canvas composite** : chrome de séance
(résumé live + barres échauffement/retour au calme + sélecteur d'ajout) et, pour chaque **segment**
de discipline reconnue, la **carte d'effort dédiée** en mode encart (`embedded`). C'est déjà
moderne et cohérent — **sauf deux points** qui subsistent et que la pratique a fait ressortir :

1. **Le segment « Personnalisé » retombe sur `GenericBlocksEditor`** (`BlockCard`/`GroupCard`,
   `block-0-type` / `block-0-params`) : l'ancien éditeur **brut clé/valeur**, sans sélecteur de
   modèle, sans défauts intelligents, sans tableau d'efforts ni résumé. ADR-42 l'avait **assumé**
   comme repli (son option C « restyler » fut rejetée). Résultat vécu : une rupture visuelle et
   logique « belle carte vs éditeur brut » au sein du même écran.
2. **Coexistence de deux vocabulaires.** Le composite parle de **« bloc »** (« Bloc 1 · Sprint »,
   « Ajouter un bloc ») alors que les cartes d'assistant parlent de **« série »** (`SeriesCardFrame`,
   « Ajouter une série »). De plus, le champ **nombre de tours** d'une carte est libellé
   **« Séries »** — ce qui crée un **doublon** avec le nom de la carte une fois tout renommé.

La cible : une **grammaire unique**. L'assistant = le canvas filtré sur une discipline ; le
« composer » = le même canvas, multi-discipline, où **toute** unité — y compris libre — est une
**carte de série** avec un sélecteur en tête.

## Décision

### D1 — Vocabulaire unique : **la série** (suppression de « bloc »)

Le mot « série » est le vocable de référence ; « Tours » lève le doublon à l'intérieur d'une carte
(cf. D2).

> **Révision (2026-06-27, en cours d'implémentation).** Vérification en réel : nommer **aussi** le
> niveau composite « série » recrée l'ambiguïté (un segment « Série 1 · Libre » contenant lui-même
> une carte « Série 1 »). On adopte donc une **hiérarchie à deux niveaux explicites** :
> - **Bloc** = unité de premier niveau du canvas composite (segment de discipline ou « Libre ») :
>   « Bloc N · X », **« Ajouter un bloc »**, « N bloc(s) », « Quelle discipline pour ce bloc ? ».
> - **Série** = la **carte** à l'intérieur d'un bloc (`SeriesCardFrame`, « Série N », ×N **Tours**),
>   suivie de ses **exercices**.
>
> Lecture cible : une séance = des **blocs**, chaque bloc = une ou plusieurs **séries**, chaque série
> = des **exercices** de **N tours**. Les `testID` (`composite-bloc-*`, `series-card-*`) étaient déjà
> alignés sur cette hiérarchie — seuls les libellés du composite reviennent à « bloc ».

### D2 — Le champ « nombre de tours » devient **« Tours »** (ex-« Séries »)

Pour lever le doublon série/série, le champ interne d'une carte (nombre de répétitions de la série,
porté par `rounds` du groupe) est libellé **« Tours »** dans **toutes** les cartes d'effort (sprint,
haies, endurance, sauts, lancers, renfo) et la carte générique. Lecture cible : « une **série** de
2 **tours** ». Renommage de libellé **uniquement** — aucun changement de données ni de `testID` de
contrôle (`*-rounds-inc`, etc. inchangés).

### D3 — La série « libre » adopte la grammaire carte (`GenericEffortCanvas`)

Nouveau canvas générique calé sur les **mêmes primitives** que les assistants
(`SeriesCardFrame` + `PresetPicker` + `EffortTable` + `CellInput` + barres écha/RAC), avec en tête
un sélecteur **« Type d'effort »** alimenté par un **catalogue générique** :

- **Chronométré** (distance + temps), **Répétitions** (reps + récup), **Gainage / PPG**
  (exercice + travail/récup), **Récup active** (durée), **Libre** (vide).
- Un type est **pré-sélectionné par défaut** (parité avec « un modèle est choisi par défaut »,
  ADR-39). Choisir un type **pré-remplit** la série avec des défauts intelligents.

Contrainte de sérialisation / inférence : le catalogue produit des feuilles de type **hors des 6
disciplines inférées** (`custom` / `core` selon le cas) afin qu'une série « libre » **reste libre**
au round-trip (jamais ré-aspirée par `inferDiscipline` dans une carte de discipline). Round-trip via
`nodesToItems` inchangé.

`GenericEffortCanvas` **remplace** `GenericBlocksEditor` :

- comme **rendu du segment libre** dans le composite (révise ADR-42 §3) ;
- comme cible de l'option d'ajout, renommée **« Libre »** (ex-« Personnalisé ») dans le sélecteur
  « Ajouter une série ».

### D4 — Point d'entrée : 6 raccourcis + **« Composer une séance »** (inchangé sur le fond)

`NewSessionScreen` conserve les **6 cartes de discipline** (raccourci = assistant mono-discipline).
La carte **« Personnalisé »** est renommée **« Composer une séance »** et ouvre le `CompositeCanvas`
vide (comportement ADR-42 §4 conservé). Aucune fusion radicale du point d'entrée.

### D5 — Invariants

- **Contrat API inchangé** : la séance reste `EditableNode[]`, sérialisée par `nodesToItems`. **Aucune
  migration**, **aucun bump** de `schemaVersion`. Round-trip C-05 préservé.
- `GenericBlocksEditor` est **retiré du chemin de création**. Il **survit** uniquement comme repli
  d'**édition** d'anciennes séances portant un bloc `custom` aux paramètres exotiques clé/valeur
  qu'aucune carte ne sait éditer (cas legacy rare, évite toute perte de données) — hors périmètre de
  création.

## Conséquences

- **+** Cohérence totale : **toute** série (discipline ou libre) s'édite avec la même grammaire de
  carte. Fin de la rupture « belle carte vs éditeur brut » et du double vocabulaire.
- **+** Parité de logique avec les assistants : type pré-sélectionné, défauts intelligents, tableau
  2-cols, résumé live, filtrage de saisie — gratuitement, via les primitives partagées.
- **+** Zéro nouveau modèle de données / contrat / migration.
- **−** Renommage transverse **« Tours »** : touche les 6 cartes + leurs tests Jest (libellés) et
  d'éventuels snapshots.
- **−** Nouveau composant `GenericEffortCanvas` + son catalogue (borné, additif), avec son mapping
  catalogue → type de feuille + défauts.
- **−** `tlx-86` (E2E, ex-`block-0-*`) doit être **réécrit** sur la grammaire série (comme `tlx-166`).
- **−** Repli d'édition legacy (`GenericBlocksEditor`) conservé pour les `custom` exotiques : un
  unique reliquat de l'ancienne grammaire, cantonné à l'édition d'anciennes séances.

## Alternatives écartées

- **Restyler `type+params` dans le cadre de carte** (sans catalogue). Rejeté : garde **deux
  grammaires de saisie** (catalogue vs clé/valeur) — l'incohérence demeure.
- **Supprimer toute série libre** (tout = une des 6 disciplines + une note « Autre »). Rejeté : perd
  les séances multi-paramètres hors-discipline (gainage chronométré, circuits libres).
- **Garder le mot « bloc »** (ou les deux mots). Rejeté : ambiguïté série/bloc et incohérence avec
  les assistants, à l'origine de la demande.
- **Fusionner le point d'entrée en un seul « Atelier » vide.** Rejeté pour l'instant : les 6
  raccourcis restent la voie rapide la plus familière (D4).

## Plan (tickets — additifs, testés)

1. **TLX-192 (mobile — vocabulaire)** — « bloc » → « série » dans `CompositeCanvas` (libellés +
   `accessibilityLabel`) ; champ « Séries » → **« Tours »** dans les 6 cartes + carte générique ;
   mise à jour des tests Jest de libellés.
2. **TLX-193 (mobile — carte générique)** — `GenericEffortCanvas` (catalogue Type d'effort + défauts,
   mapping vers feuilles `custom`/`core`) ; intégration comme rendu du segment « Libre » du composite
   et comme cible du sélecteur « Ajouter une série » ; retrait de `GenericBlocksEditor` du chemin de
   création ; tests des deux modes (standalone / embedded) + round-trip.
3. **TLX-194 (mobile — entrée)** — `NewSessionScreen` : « Personnalisé » → **« Composer une séance »**
   + tests.
4. **TLX-195 (E2E)** — réécrire `tlx-86` sur la grammaire série ; nouveau parcours : composer une
   séance (série Sprint + série Libre « Gainage/PPG »), sérialiser, rouvrir en édition → mêmes séries,
   round-trip vérifié.

Chaque ticket reste additif, sans migration ni bump de `schemaVersion`.
