# ADR-41 — Carte d'effort « Renforcement / PPG » : 6ᵉ discipline guidée, modèle de données inchangé

- **Statut :** Accepté (2026-06-17)
- **Date :** 2026-06-17
- **Complète :** ADR-38 (assistants par discipline + extension additive des `params`), ADR-39
  (cartes d'effort dédiées, patron Sprint), ADR-40 (cartes en édition par inférence de
  discipline), ADR-18/27 (`exercises` v2/v3 — base `sets`/`reps`/`load` + groupes `series`),
  ADR-20 (records → cible individualisée, lecture seule), ADR-28 (param `tempo` sur `strength`)
- **Réf. :** maquette HTML cliquable « Renforcement / PPG » (prototype validé 2026-06-17,
  même grammaire que les 5 cartes athlé), CLAUDE.md règle 7 (nouvelle discipline = décision
  structurante → ADR avant code)
- **Tickets liés :** nouveaux TLX-172→175 (cf. §Plan)

## Contexte

Les 5 disciplines athlé (Sprint, Haies, Endurance, Sauts, Lancers) ont leur carte d'effort
dédiée (ADR-39/40). Le **renforcement musculaire** et la **PPG** (préparation physique générale)
sont une brique d'entraînement majeure en athlétisme mais n'ont **aucun assistant** : ils ne se
créent qu'avec le constructeur générique C-05 (blocs `strength` / `core` saisis à la main).

Le prototype validé montre qu'on peut **réutiliser la grammaire existante** sans la tordre, en
traduisant chaque concept de la carte athlé :

| Concept générique | Athlé (ADR-39/40) | Renforcement / PPG |
|---|---|---|
| Effort (ligne de table) | course / saut / jet | **un exercice** (squat…) / **une station** (gainage…) |
| Série (carte repliable) | bloc « 3 × 30 m » | **un bloc de travail** (séries droites ou circuit) |
| Référence individualisée | record (PB) → temps/dist. cible | **1RM** → **charge cible** (« ≈ 119 kg ») |
| Badge de volume | volume (km) | **tonnage** (kg) ou volume de reps |
| Mode d'intensité (segmented) | % VMA / allure / zone | **% 1RM / kg / poids de corps / RPE** |
| Preset (méthode) | « Vitesse max »… | **Force max / Hypertrophie / Puissance / Pliométrie / Circuit PPG / Gainage** |

Le parallèle **1RM = record** rend la carte cohérente avec ADR-20/38/39 : la charge cible se
dérive d'une référence et l'individualisation par athlète reste un **affichage** (différable).

## Décision

### 1. Une 6ᵉ discipline guidée « Renforcement / PPG », à deux modes internes

- Nouvelle `DisciplineKey 'strength'` (`discipline-assistants.ts`) → 6ᵉ tuile de l'écran
  « Nouvelle séance ». **Une seule** discipline (pas deux tuiles séparées Muscu/PPG).
- Au niveau de **chaque série**, un **segmented `Mode`** bascule entre :
  - **Muscu** → séries droites, blocs `BlockType.strength` ;
  - **PPG / Circuit** → stations en tours, blocs `BlockType.core` regroupés en `group`
    (`groupType: 'circuit'`), tours portés par `rounds`.
  
  La bascule **remappe le `BlockType`** des lignes (`strength` ↔ `core`), exactement comme
  l'Endurance remappe `endurance` ↔ `interval` au changement Distance/Durée (ADR-40). La
  discipline n'est **pas** stockée (cohérent ADR-38 §1) : elle reste dérivée des `BlockType`.

### 2. Sérialisation sur les champs **canoniques** (round-trip C-05 garanti, invariant ADR-38/40)

La carte lit/écrit les mêmes `EditableNode` que le constructeur générique :

- **Muscu** (`strength`) : `sets`, `reps`, `load { value, unit }`, `tempo` (param existant
  ADR-28), nom d'exercice dans le champ de base **`name`** (pas de nouveau param).
- **PPG** (`core`) : chaque station = un `strength`/`core` membre avec **`durationSeconds`**
  (travail en s) **ou `reps`** (travail en répétitions) + **`restSeconds`** (récup r) ; tours =
  `rounds` du groupe ; récup entre tours = `restBetweenRoundsSeconds`.

Aucun nouveau type de bloc, aucune migration : on réutilise base v2/v3 + `params` libres.

### 3. Mode de charge — `% 1RM / kg / poids de corps` via `load.unit` existant, **RPE additif en `params`**

- `% 1RM`, `kg`, `poids de corps` utilisent directement l'enum `LoadUnit`
  (`percent_1rm` / `kg` / `bodyweight`) **déjà** au contrat — zéro changement.
- **RPE** : pas d'ajout à l'enum `LoadUnit` (ce serait toucher `@talent-x/api-client` + OpenAPI
  + backend). On stocke RPE en **param additif** `params.rpe` (méthode ADR-38 §2,
  `additionalProperties: true`), `loadUnit` laissé à `null`. Le mode de charge est **dérivable**
  (`loadUnit` s'il est posé, sinon `'rpe'` si `params.rpe`). **Aucun bump `schemaVersion`,
  aucune migration, aucun changement de contrat REST.**

### 4. Charge cible dérivée du 1RM (référence fictive, front-only)

- Table **`ONE_RM_REFERENCE`** (kg par exercice, fictive — même esprit que `HURDLE_RECORDS` /
  `JUMP_RECORDS`, ADR-40), côté carte. En mode `% 1RM`, la ligne affiche `≈ <kg>` sous l'input
  (`InfoNote` inline), comme la cible temps/distance des autres cartes.
- L'**individualisation par athlète** (1RM réel par athlète) reste une dérivation d'**affichage**
  **différée** : pas de nouveau store de 1RM dans ce lot (cohérent ADR-20 — la cible est une
  référence générique tant que l'individualisation n'est pas livrée). Aucun lien
  `personal_records` ici (les records ADR-20 sont des épreuves athlé, pas des 1RM muscu).

### 5. Badge de volume — **tonnage** (helper additif `session-summary`)

- Nouveau helper dans `session-summary` : tonnage (kg) = Σ `sets × reps × chargeKg` quand la
  charge est chiffrable en kg (mode kg, ou %1RM via `ONE_RM_REFERENCE`) ; **repli** sur un
  **volume de répétitions** (Σ `sets × reps`) quand la charge n'est pas convertible (poids de
  corps, RPE, PPG en durée). Purement additif, ne touche pas `sessionKpis`/`formatDistanceVolume`.

### 6. Inférence (ADR-40) étendue à `strength`/`core` → édition + détail dédiés

- `discipline-inference.ts` : `BlockType.strength` **et** `BlockType.core` mappent vers
  `'strength'`. Conséquence (voulue, cohérente ADR-40) : une séance homogène muscu/PPG **créée
  avant** cette feature s'ouvre désormais sur la carte dédiée en **édition** et obtient un
  **résumé** sur l'écran de détail lecture seule. Repli générique inchangé pour toute structure
  mixte/hétérogène. La carte doit **lire défensivement** les blocs `strength`/`core` existants
  (champs base éventuellement vides → rendu sans crash).

### 7. Presets (`STRENGTH_PRESETS`)

| Preset | Mode | Repère |
|---|---|---|
| Force max | Muscu | 4×5 @ 85–95 %1RM, R 3–5′ |
| Hypertrophie | Muscu | 4×10 @ 65–75 %1RM, R 90″ |
| Force-vitesse / Puissance | Muscu | 5×3 @ 40–60 %1RM, explosif |
| Pliométrie | Muscu | 5×5 contacts, poids de corps |
| Circuit PPG | PPG | 3 tours × 6 stations, 40″/20″ |
| Gainage | PPG | 3 tours × 4 stations, 45″ |

## Conséquences

- **+** Couverture d'un pan d'entraînement majeur sans nouveau type de bloc ni migration.
- **+** Réutilise intégralement les primitives `effort-card-shared`, l'inférence ADR-40, le
  round-trip C-05 (invariant ADR-38 préservé) et `session-summary`.
- **+** RPE et nom d'exercice livrés sans toucher le contrat REST (param additif + champ `name`).
- **−** Deux représentations du « circuit » coexistent : `core` standalone générique (params
  `rounds`/`stationSeconds`, C-05) vs station PPG (base `durationSeconds`/`restSeconds` en
  groupe). Mitigé : la carte lit les deux et écrit la forme groupe ; round-trip préservé par
  `nodesToItems`. Risque de divergence documenté.
- **−** L'inférence route désormais les séances pure-`core`/pure-`strength` existantes vers la
  carte dédiée en édition (changement de comportement). Accepté : c'est l'objet d'ADR-40.
- **−** 1 nouvelle clé `params` additive (`rpe`) + 1 table de référence fictive (1RM) à valider
  en revue ; individualisation 1RM réelle différée.

## Alternatives écartées

- **Deux disciplines séparées (Muscu / PPG).** Rejeté : elles partagent la même carte et le même
  contrat ; un segmented interne suffit et garde l'écran de choix lisible.
- **Ajouter `rpe` à l'enum `LoadUnit`.** Plus « propre » sémantiquement mais touche
  `@talent-x/api-client` + OpenAPI + DTO backend → sort du périmètre additif. Param `params.rpe`
  équivalent fonctionnellement, zéro contrat.
- **Store de 1RM par athlète dès ce lot.** Élargit fortement (nouveau modèle de données + RGPD) ;
  différé, la cible reste une référence générique (cohérent avec le différé d'individualisation
  des records ADR-20).
- **Carte réservée à la création (statu quo ADR-39 d'origine).** Rejeté : incohérent avec ADR-40
  qui a fait de l'édition dédiée la norme.

## Plan (tickets — additifs, testés)

1. **TLX-172 (données/contrat)** — `discipline-assistants.ts` (clé `strength` + entrée
   `DISCIPLINES`), `assistant-presets.ts` (`ONE_RM_REFERENCE`, `STRENGTH_PRESETS`, factories
   muscu/PPG, seed), `session-builder-ui.tsx` (`BLOCK_TYPE_SPECS` : `strength` + `params.rpe` /
   `exerciseName` additifs), `session-summary` (helper tonnage / volume reps),
   `discipline-inference.ts` (`strength`/`core` → `'strength'`) + tests unitaires.
2. **TLX-173 (mobile — carte)** — `strength-effort-card.tsx` (`StrengthEffortCanvas` : segmented
   Mode Muscu/PPG, table exercices/stations, segmented charge %1RM/kg/PdC/RPE, cible dérivée,
   en-tête résumé live + badge tonnage, astuce coach par preset) ; câblage dans
   `DISCIPLINE_CANVAS` (création + édition via inférence) ; tests rendu + interactions.
3. **TLX-174 (mobile — détail)** — `CoachSessionDetailScreen` : résumé pour la discipline
   `strength` inférée (lecture seule).
4. **TLX-175 (E2E)** — Playwright : assistant Renforcement → carte (Muscu + PPG) → sérialisation
   `POST /sessions` conforme → réouverture en édition (round-trip carte dédiée).

Chaque ticket reste additif, sans migration ni bump de `schemaVersion`.
