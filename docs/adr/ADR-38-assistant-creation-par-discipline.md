# ADR-38 — Assistant de création/affichage de séance par discipline (extension additive d'`exercises` v3)

- **Statut :** Proposé
- **Date :** 2026-06-15
- **Complète :** ADR-18 (`exercises` v2, `BlockType` + `params` libres), ADR-27 (`exercises`
  v3, groupes `kind: "group"` / `groupType: "series"`), ADR-28 (brief de séance), ADR-20/21
  (records & progression — lecture seule), ADR-36 (journal d'entraînement libre athlète)
- **Tickets liés :** TLX-052 (constructeur C-05), TLX-053→061 (éditeurs typés, livrés),
  TLX-132 (séance libre athlète) ; nouveaux tickets proposés TLX-148→15x (cf. §Plan)
- **Réf. :** maquette HTML fournie (`Talent-X — Nouvelle séance` + 5 écrans de création par
  discipline + écran « Récapitulatif »), CLAUDE.md règle 7

## Contexte

### La demande

Une maquette front (HTML statique, 6 écrans navigables) propose un parcours **« discipline
d'abord »** pour la création et l'affichage des séances :

1. Écran d'accueil « Nouvelle séance » → 5 cartes de disciplines (**Sprint, Haies,
   Demi-fond/Endurance, Sauts, Lancers**) + une section « Résumés (aperçu) ».
2. Un **formulaire dédié par discipline**, structuré en *séries* (groupes répétés), avec
   des champs et presets propres à la discipline (ex. Sprint : séries de sprints avec
   distance/intensité/récup, référentiel d'intensité, type de départ ; Haies : épreuve,
   hauteur, espacement, rythme d'appuis, jambe d'attaque ; etc.).
3. Un écran de **récapitulatif** (affichage) avec bascule **vue coach / vue athlète**,
   KPIs (volume, nb de répétitions, durée estimée), une « phrase » de séance condensée
   (ex. « 2 × (30·40·50 m) + 3 × (100·100 m) »), des phases dépliables avec tableaux de
   cibles, et les critères « Réussi si… » / « Stop si… ».

Ceci diverge en apparence du modèle en place : le constructeur C-05 (`SessionBuilderScreen`)
est un **éditeur de blocs/groupes génériques**, où le coach assemble librement des blocs de
n'importe quel `BlockType` au sein d'une même séance.

### Découverte clé — le contrat cible existe déjà

Examen du code de la maquette (`save()` de chacun des 5 écrans) : chaque écran sérialise
**déjà** vers le contrat `ExercisesDoc` v3 actuel, sans aucun champ hors contrat :

```jsonc
{
  "title": "...", "status": "draft",
  "exercises": { "schemaVersion": 3, "items": [
    { "kind": "group", "name": "Série 1", "order": 1, "groupType": "series",
      "rounds": 2, "restBetweenRoundsSeconds": 360,
      "items": [
        { "name": "30 m", "order": 1.1, "type": "sprint", "reps": 1, "restSeconds": 180,
          "params": { "distanceMeters": 30, "startType": "blocks", "flyingZone": false,
                      "intensityMode": "percent_record", "intensityValue": 90 } }
      ] }
  ] }
}
```

C'est exactement la combinaison **ADR-27 (`kind: "group"`, `groupType: "series"`, `rounds`,
`restBetweenRoundsSeconds`)** + **ADR-18 (`BlockType` : `sprint`, `hurdles`,
`endurance`/`interval`, `jumps`/`vertical_jumps`, `throws`) + `params` libre
(`additionalProperties: true`)**. Les 5 écrans n'introduisent que des **clés `params`
supplémentaires**, déjà couvertes par la clause additive du contrat (§9.1 :
« le cadre v2 laisse `params` libre … la forme par discipline est fixée par le ticket de
l'éditeur correspondant »).

**Conséquence :** pas de nouveau schéma `exercises` (« v4 ») et pas de migration. Ce que
propose la maquette est :
- un **second mode de saisie**, guidé par discipline, qui *produit* le même document v3
  qu'aujourd'hui le constructeur par blocs (TLX-052→061) ;
- un **nouvel écran d'affichage** (récapitulatif coach/athlète), qui *lit* ce même document.

## Décision (proposée)

### 1. Un nouveau point d'entrée « Assistant par discipline », à côté du constructeur

- Nouvel écran **« Nouvelle séance »** (coach) : choix d'une discipline parmi les 5
  familles de la maquette → ouvre un **assistant dédié** qui pré-structure la séance en
  **séries** (`groupType: "series"`) homogènes pour cette discipline, avec presets
  (ex. « Vitesse max », « VMA longue », « Longueur — élan complet »…).
- Le **constructeur générique (C-05, `SessionBuilderScreen`)** est **conservé tel quel**
  pour : l'édition d'une séance existante (y compris une séance créée par l'assistant —
  elle reste un document v3 standard, donc éditable bloc par bloc), les séances
  **multi-disciplines** (échauffement + sprint + sauts dans la même séance, circuits,
  modèles génériques) et les types non couverts par l'assistant (`strength`, `core`,
  `warmup`, `cooldown`, `custom`).
- **`Session.discipline` n'est PAS un nouveau champ persistant.** La discipline reste
  **dérivée** des `BlockType` présents dans `exercises.items` (comme le fait déjà
  `FreeSessionLog`, ADR-36, pour la détection ADR-20). L'assistant ne fait que **garantir**,
  à la création, l'homogénéité des types pour une discipline donnée — il ne crée pas de
  contrainte de schéma.
- **Athlète (« Les deux » ciblé) :** le même assistant par discipline alimente
  `POST /athletes/me/training-log` (ADR-36/TLX-132) — c'est la **généralisation naturelle**
  de `FreeSessionLog`, dont les `FAMILIES` (sprint/hurdles/endurance/interval/jumps/
  vertical/throws) couvrent déjà ces 5 disciplines avec un seul exercice ; l'assistant
  permet une saisie multi-séries plus riche, en option.

### 2. Extension additive des `params` par `BlockType` (documentation + DTO)

Les `params` restent `additionalProperties: true` (aucun changement de contrat), mais pour
que `talent-x-openapi.yaml` et `BLOCK_TYPE_SPECS` (mobile) restent la **référence unique**
des clés réellement consommées (et que les DTO Zod backend les valident), on **documente
et code** les nouvelles clés introduites par la maquette, par type :

| `type` | Clés `params` existantes (TLX-054→061) | Nouvelles clés (maquette) |
|---|---|---|
| `sprint` | `reps`, `distanceMeters`, `recoverySeconds`, `percentVma` | `startType` (`standing\|three_point\|blocks\|flying`), `flyingZone` (bool), `intensityMode` (`percent_record\|target_time\|speed`), `intensityValue` |
| `hurdles` | `distanceMeters`, `heightCm`, `spacingMeters`, `rhythmSteps` | `event`, `spacingMode` (`regulation\|modified`), `hurdleCount`, `approachMeters`, `leadLeg`, `startType`, `intensityMode`, `intensityValue` |
| `endurance` | `distanceMeters`, `paceSecondsPerKm`, `elevationMeters` | `recoveryType` (`active\|passive`), `workSeconds`, `percentVma`, `specificEvent`, `hrZone` |
| `interval` | *(aucune, type custom)* | mêmes clés qu'`endurance` (cf. ci-dessus) — la maquette bascule `endurance`/`interval` selon que la répétition est en distance ou en durée |
| `jumps` | `approachMeters`, `fullJumps`, `plyoContacts` | `discipline` (`long\|triple`), `approach` + `approachUnit` (`steps\|meters`), `attempts`, `takeoff`, `targetMeters`, `targetMode` (`percent\|absolute`), `targetPercent` |
| `vertical_jumps` | `discipline` (`high\|pole`), `startHeightCm`, `incrementCm` | `bars`, `attemptsPerBar`, `gripCm` (perche) |
| `throws` | `implementKg`, `techniqueThrows`, `fullThrows` | `discipline` (`shot\|discus\|javelin\|hammer`), `sex` (`M\|F`, pour les poids réglementaires), `implementState` (dérivé masse/réglementaire), `targetMeters`, `targetMode`, `targetPercent`, `style` (poids uniquement) |

**Point à trancher avant rédaction finale du contrat** : `jumps` porte aujourd'hui
`approachMeters` (TLX-058) ; la maquette utilise `approach` + `approachUnit`
(`steps|meters`). Proposition : **généraliser en `approach` + `approachUnit`**
(rétro-compat : un document existant avec `approachMeters` reste valide, lu comme
`approach`/`approachUnit:"meters"` par le mapper). À valider en revue de contrat, pas
structurant pour cet ADR.

### 3. Écran de récapitulatif (affichage) — extension de l'existant, pas de nouvel écran isolé

Le « Récapitulatif » de la maquette recoupe largement l'existant :

- **Phases dépliables + tableaux de cibles** ↔ `SessionContent` (rendu des groupes ADR-27,
  déjà group-aware).
- **« Réussi si… » / « Stop si… »** ↔ `brief.successCriteria` / `brief.stopCriteria`
  (ADR-28, `CoachBriefReview` / `BriefEditor`).
- **KPIs (volume, nb de répétitions, durée)** ↔ logique d'agrégation déjà présente pour le
  brief (`estimateDurationMinutes`, `brief-ui.tsx`) — à étendre avec un volume agrégé par
  discipline (ex. somme des `distanceMeters` des feuilles `sprint`).
- **Bascule vue coach / vue athlète avec cibles individualisées** (`intensityMode:
  "percent_record"` → temps cible dérivé du record personnel de l'athlète, ADR-20) est
  **net-new** : aujourd'hui les cibles affichées sont les mêmes pour tous. Nécessite, côté
  affichage uniquement (lecture), de joindre le record personnel de l'athlète assigné pour
  calculer `target = ref / (intensityValue/100)`. Pas de nouveau contrat de stockage —
  dérivation de lecture, comme ADR-20/21.
- **« Phrase » de séance condensée** (ex. « 2 × (30·40·50 m) + 3 × (100·100 m) ») : nouvelle
  fonction pure de formatage, dérivée d'`exercises.items` (un groupe `series` × ses
  feuilles `sprint`/`distanceMeters`) — pas de donnée persistée.

Décision : **étendre `SessionContent` / `CoachSessionDetailScreen` / l'écran de détail
athlète** avec ces éléments (phrase, KPIs étendus, bascule de vue pour l'athlète assigné),
plutôt que créer un écran de récapitulatif parallèle qui dupliquerait le rendu des groupes.

## Impacts

| Surface | Impact |
|---|---|
| `talent-x-openapi.yaml` | Documentation des nouvelles clés `params` (table §2) dans la description de chaque usage de `Exercise.params` par `type` — additif, pas de bump `schemaVersion`. |
| `Talent-X_06_Modele_de_donnees.md §9.1` | Compléter la liste des clés `params` documentées par discipline. |
| Backend (DTO Zod) | Étendre les schémas de validation des `params` par `type` (whitelist actuelle TLX-054→061) avec les nouvelles clés — additif, pas de migration. |
| `BLOCK_TYPE_SPECS` (mobile) | Étendre `paramFields` par type avec les nouvelles clés (table §2) ; les éditeurs de blocs génériques (`BlockCard`) restent **réutilisables tels quels** dans l'assistant pour la partie « champs avancés » le cas échéant. |
| Nouveaux écrans coach | Écran « Nouvelle séance » (choix discipline) + 5 assistants (Sprint/Haies/Endurance/Sauts/Lancers), construits sur les **mêmes primitives `ExerciseGroup`/`Exercise`** que C-05 — sérialisation via `nodesToItems`/`makeEmptyGroup` existants, enrichis de presets par discipline. |
| Athlète (`FreeSessionLog`, ADR-36) | Généralisation optionnelle : remplacer le formulaire mono-exercice par le même assistant multi-séries, réutilisant `FAMILIES` → `BlockType`. |
| Affichage (`SessionContent`, `CoachSessionDetailScreen`, détail athlète) | + « phrase » de séance, + KPIs étendus (volume par discipline), + bascule vue coach/athlète avec cibles individualisées (lecture des records ADR-20). |
| Records / progression (ADR-20/21) | **Aucun changement de contrat.** La dérivation de cible individualisée est un calcul de lecture supplémentaire, basé sur les `personal_records` déjà exposés. |
| `results` (ADR-19) | **Inchangé.** Les feuilles produites par l'assistant sont des `Exercise` v3 standard (membres de groupe `series`) — la saisie de perf suit la mécanique groupe existante (ADR-27). |

## Conséquences

- **+** Zéro migration, zéro changement de `schemaVersion`, zéro endpoint nouveau pour la
  création — l'assistant est une **UX alternative** au-dessus du même contrat.
- **+** Réutilisation maximale : `ExerciseGroup`/`groupType: "series"` (ADR-27),
  `BLOCK_TYPE_SPECS` (TLX-054→061), `SessionContent`, brief (ADR-28), records (ADR-20)
  pour les cibles individualisées.
- **+** Le constructeur générique C-05 reste la voie d'édition unique (toute séance créée
  par l'assistant est un document v3 ordinaire, éditable par blocs) — pas de fourche de
  modèles de données.
- **−** Surface UI significative : 5 nouveaux assistants + presets + écran de choix de
  discipline, et l'extension de l'affichage (phrase, KPIs, bascule de vue). À découper en
  plusieurs tickets (cf. plan).
- **−** La bascule « vue athlète » avec cibles individualisées introduit une **dépendance
  de lecture** affichage → records personnels, qui n'existait pas dans `SessionContent`
  (à vérifier : disponibilité du `athleteId` dans le contexte de l'écran coach — l'écran
  actuel n'est pas scopé par athlète puisqu'une séance peut être assignée à plusieurs
  athlètes/groupes ; la bascule n'a donc de sens que **depuis le détail d'une
  affectation** précise, pas depuis le détail générique de la séance).
- **−** Décision ouverte sur `approachMeters` vs `approach`/`approachUnit` (jumps) à
  trancher en revue de contrat (cf. §2), sans impact structurant.

## Alternatives écartées

- **Nouveau schéma `exercises` v4 typé par discipline (modèle de données dédié par
  discipline, au niveau séance)** : envisagé initialement, mais l'examen du code de la
  maquette montre que son propre payload de sauvegarde cible **déjà** le contrat v3
  existant. Une v4 dupliquerait ce que `params` (additif) couvre déjà, imposerait une
  migration et casserait la réutilisation du constructeur générique pour l'édition.
  Rejetée.
- **Remplacer le constructeur C-05 par l'assistant par discipline** : perdrait la capacité
  de composer des séances multi-disciplines/mixtes (échauffement + sprint + sauts,
  circuits, modèles génériques `custom`), qui est un usage réel et déjà livré
  (TLX-053→061). L'assistant et le constructeur servent des besoins différents
  (création guidée mono-discipline vs composition libre) ; le second reste la voie
  d'édition unique. Rejetée.
- **Écran de récapitulatif isolé, dupliquant le rendu des groupes** : dupliquerait
  `SessionContent`/`CoachBriefReview` (rendu des groupes, brief) — deux implémentations à
  maintenir en synchronisation. Rejetée au profit d'une extension de l'existant.

## Plan (proposition de découpage, à valider en backlog)

1. **TLX-148** — Contrat : documenter les nouvelles clés `params` par `type` (table §2)
   dans `talent-x-openapi.yaml` + `Talent-X_06_Modele_de_donnees.md §9.1` ; étendre les DTO
   Zod backend (additif, tests endpoint).
2. **TLX-149** — Mobile : étendre `BLOCK_TYPE_SPECS` (`session-builder-ui.tsx`) avec les
   nouvelles clés ; aucune UI nouvelle, juste le typage/édition générique.
3. **TLX-150** — Écran « Nouvelle séance » (coach) : choix de discipline → route vers
   l'assistant correspondant (ou le constructeur générique pour « Personnalisé »).
4. **TLX-151→155** — Un assistant par discipline (Sprint, Haies, Endurance, Sauts,
   Lancers) : formulaire en séries + presets, sérialisant vers `ExercisesDoc` v3 via les
   primitives existantes (`makeEmptyGroup`, `nodesToItems`).
5. **TLX-156** — Affichage : « phrase » de séance + KPIs étendus dans `SessionContent`/
   `CoachSessionDetailScreen`.
6. **TLX-157** — Affichage : bascule vue coach/athlète avec cibles individualisées
   (lecture records ADR-20), scopée au détail d'une **affectation**.
7. **TLX-158** — Athlète : généraliser `FreeSessionLog` à l'assistant multi-séries
   (optionnel, dépend de TLX-151→155).

Chaque ticket reste **additif, testé** (endpoints backend, rendu + interactions front),
sans migration ni bump de `schemaVersion`.
