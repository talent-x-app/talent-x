# ADR-39 — Refonte UI des assistants par discipline : cartes d'effort dédiées (fidélité maquette), modèle de données inchangé

- **Statut :** Accepté (2026-06-16)
- **Date :** 2026-06-16
- **Complète :** ADR-38 (assistant de création par discipline — en **réutilise le contrat de
  données à l'identique**), ADR-18/27 (`exercises` v2/v3 — `BlockType` + groupes `series`),
  ADR-28 (brief), ADR-20 (records → cible individualisée, lecture seule), TLX-160
  (`session-summary` : phrase + KPIs)
- **Réf. :** maquette `sprint-card.html` (carte « Effort de sprint », haute fidélité), CLAUDE.md
  règle 7 (divergence structurante par rapport à un ADR existant → ADR à valider avant de coder)
- **Tickets liés :** TLX-155→159 (assistants livrés, ADR-38) ; nouveaux TLX-163→167 (cf. §Plan)

## Contexte

### Le constat

ADR-38 a livré les assistants par discipline comme une **« mince surcouche du constructeur
générique »** (`SessionBuilderScreen` pré-seedé en séries + presets). Vérification **en réel**
(Expo web + API, coach seedé via REST, 2026-06-16) : l'assistant Sprint affiche le **rendu
générique de blocs** (champs texte, chips de type de bloc, paramètres en saisie libre), très
éloigné de la maquette `sprint-card.html`. Seul l'écran de **choix de discipline** correspond
visuellement à la maquette.

La maquette proposait une **carte d'effort dédiée** : chips de distance, steppers
répétitions/séries, segmented d'intensité, switch « au signal », **résumé live** en en-tête,
**badge de volume**, **cible dérivée** (« ≈ 7″37 / rep »), **astuce coach** contextuelle, récup
en chips avec bascule passive/active. Rien de tout cela n'a été porté.

### Ce que l'ADR-38 a (et n'a pas) tranché

ADR-38 a optimisé le **modèle de données** : sa découverte clé était que le payload de la
maquette cible **déjà** le contrat `exercises` v3 → zéro migration, `params` additifs. Mais il a
de fait traité la maquette comme un **contrat de données à découvrir**, pas comme une **UX à
reproduire** — et **n'a pas formulé** ce compromis (la fidélité visuelle a été abandonnée au
profit de la réutilisation du constructeur). Décision produit (2026-06-16) : **l'écart est trop
important**, on veut la fidélité maquette.

### Découverte — le coût de la fidélité est surtout du front

- Le **contrat de données est déjà correct** : les presets Sprint posent déjà `distanceMeters`,
  `startType`, `flyingZone`, `intensityMode`, `intensityValue`, `recoverySeconds` (cf.
  `assistant-presets.ts`).
- Le **design system fournit déjà** `Chip` (pill, état sélectionné) — réutilisable pour les
  chips de distance / départ / récup et pour un segmented (sélection unique).
- **TLX-160 fournit déjà** `sessionPhrase()` (phrase condensée), `sessionKpis()` et
  `formatDistanceVolume()` — directement réutilisables pour l'**en-tête résumé live** et le
  **badge volume** de la carte.
- Il manque essentiellement : 2 primitives DS (`Stepper`, `Switch`) et une **carte d'effort
  dédiée** par discipline.

## Décisions de cadrage validées (2026-06-16)

Trois points tranchés par le porteur produit avant implémentation :

1. **« Au signal / temps de réaction » : coupé.** Pas de nouveau param `atSignal`. Conséquence :
   la primitive `Switch` n'est **plus nécessaire** (le seul usage de switch de la maquette était
   « au signal »).
2. **Périmètre du 1er lot : Sprint seul.** Les 4 autres disciplines sont **différées** (même
   patron, tickets ultérieurs hors de ce lot).
3. **Édition d'une séance existante : reste en C-05.** La carte dédiée ne sert qu'en **création**.

## Décision

1. **Cartes d'effort dédiées dans les assistants (création).** Dans le périmètre des assistants
   par discipline, remplacer le rendu générique de blocs par une **carte d'effort fidèle à la
   maquette**. **Sprint d'abord** (seule carte haute-fidélité disponible) comme implémentation de
   référence ; les 4 autres disciplines suivent le **même patron** (tickets dédiés).

2. **Invariant ADR-38 préservé.** La carte dédiée **lit et écrit le même `EditableNode[]` /
   `params`** que le constructeur générique. Conséquence : une séance créée via la carte reste un
   **document `exercises` v3 standard, éditable bloc par bloc en C-05 sans perte**. La carte est
   un **éditeur visuel alternatif**, pas un nouveau modèle de données.

3. **Constructeur générique C-05 inchangé.** Conservé pour : l'**édition d'une séance existante**
   (y compris créée par l'assistant), les séances **multi-disciplines/mixtes**, et l'option
   « Personnalisé ». L'édition d'une séance existante **reste en C-05** ; la carte dédiée ne
   couvre que la **création** dans l'assistant (limite le périmètre, préserve l'invariant).

4. **Primitive design system à ajouter** (réutilisable, tokens du DS) : `Stepper` (+/−
   numérique borné). Le « segmented » et les rangées de choix (intensité, récup passive/active)
   se font avec `Chip` (sélection unique) déjà au DS. *(`Switch` n'est plus requis — « au signal »
   coupé.)*

5. **Éléments de la maquette portés (Sprint).**
   - En-tête **résumé live** (`sessionPhrase`) + **badge volume** (`sessionKpis` /
     `formatDistanceVolume`).
   - **Chips de distance** (20→150 m + « autre »).
   - **Steppers** répétitions / séries.
   - **Chips de départ** (Debout / 3 appuis / Blocs / Lancé). *(Switch « au signal » coupé.)*
   - **Segmented d'intensité** (% du record / temps cible / vitesse) + **valeur d'intensité**.
   - **Cible dérivée de référence** (record de réf. → temps cible) ; l'**individualisation par
     athlète** reste une dérivation d'**affichage** (TLX-161), hors de l'éditeur.
   - **Récup r** (chips + bascule passive/active) et **récup R** (chips).
   - **Astuce coach** contextuelle par preset.
   - **`% VMA` non rendu par la carte** sur `sprint` : la carte bespoke ne l'affiche pas →
     le doublon (constaté à l'écran) disparaît **là où il était**, dans l'assistant. Le champ
     **reste dans la spec** `BLOCK_TYPE_SPECS` : le constructeur C-05 le conserve et le
     **round-trip est préservé** (`blockToExercise` ne sérialise que les `params` de la spec —
     le retirer effacerait la valeur stockée des séances existantes).

6. **Extension additive de `params`** (méthode ADR-38 §2, `additionalProperties: true`) :
   `recoveryType` (`active|passive`) **étendu à `sprint`** (bascule récup r de la maquette).
   Documenté dans `talent-x-openapi.yaml` + `Talent-X_06 §9.1` + DTO Zod backend +
   `BLOCK_TYPE_SPECS`. **Aucun bump `schemaVersion`, aucune migration.** *(`atSignal` coupé.)*

## Impacts

| Surface | Impact |
|---|---|
| Mobile — DS | Nouveau composant `Stepper` (+ tests rendu/interaction). |
| Mobile — assistant | Nouvelle `SprintEffortCard` (+ carte de série) ; câblée dans `DisciplineAssistantScreen` pour la **création** Sprint (remplace le rendu générique). Réutilise `Chip`, `session-summary`. |
| Mobile — éditeur | Carte bespoke : `% VMA` non rendu (résout le doublon). C-05 inchangé (round-trip préservé). |
| Contrat | `params` reste **libre** (`additionalProperties`, pas de whitelist par clé) : `recoveryType@sprint` documenté (OpenAPI + `Talent-X_06 §9.1` + `BLOCK_TYPE_SPECS`) + couvert par un test `ValidationPipe`. Additif. |
| Affichage (récap) | **Inchangé** — déjà couvert par TLX-160 (phrase/KPIs) et TLX-161 (cible individualisée). |
| Backend / `results` / records | **Aucun changement** — feuilles `sprint` v3 standard. |

## Conséquences

- **+** Fidélité maquette retrouvée ; `Stepper` devient une primitive **réutilisable** pour les 4
  autres assistants et au-delà.
- **+** Invariant ADR-38 préservé (édition C-05 intacte) → **pas de fourche de modèle de données**.
- **+** Réutilise TLX-160 pour l'en-tête (résumé + volume) → peu de code neuf.
- **−** Surface UI réelle : une carte dédiée par discipline (5 à terme). **Découpé**, Sprint d'abord.
- **−** Deux éditeurs visuels pour le même document (carte dédiée en création vs blocs en édition) :
  risque de divergence si l'un évolue sans l'autre. **Mitigé** par la sérialisation commune
  (mêmes `params`, mêmes primitives `makeBlock`/`makeSeriesGroup`).
- **−** 1 nouvelle clé `params` additive (`recoveryType@sprint`) à valider en revue de contrat.

## Alternatives écartées

- **Garder le constructeur générique (état ADR-38).** Rejeté par décision produit : écart maquette
  trop important.
- **Carte dédiée aussi pour l'édition d'une séance existante.** Élargit le périmètre et risque la
  perte d'info sur des séances hétérogènes (multi-types). **Différé** : l'édition reste en C-05.
- **Réécrire `SessionBuilderScreen` lui-même en cartes typées.** Casserait l'usage
  multi-disciplines / « Personnalisé » (composition libre de blocs). Rejeté.

## Plan (tickets — additifs, testés)

**Lot 1 (ce lot) — Sprint :**

1. **TLX-163 (contrat)** — `recoveryType@sprint` : OpenAPI + `Talent-X_06 §9.1` + DTO Zod backend
   (tests endpoint) + `BLOCK_TYPE_SPECS`.
2. **TLX-164 (DS)** — primitive `Stepper` (+ tests).
3. **TLX-165 (mobile)** — `SprintEffortCard` fidèle maquette (chips distance/départ/récup +
   steppers reps/séries + segmented intensité + en-tête résumé live + badge volume + astuce
   coach), câblée dans l'assistant Sprint ; masquer `% VMA` sprint ; tests rendu + interactions.
4. **TLX-166 (E2E)** — parcours Playwright : assistant Sprint → carte d'effort → sérialisation
   `POST /sessions` conforme.

**Différé (hors lot 1) :**

5. **TLX-167 (mobile, suite)** — porter le patron aux 4 autres disciplines
   (Haies / Endurance / Sauts / Lancers) — 1 ticket par discipline.

Chaque ticket reste **additif, sans migration ni bump de `schemaVersion`**, et la séance produite
demeure éditable en C-05 (invariant ADR-38).
