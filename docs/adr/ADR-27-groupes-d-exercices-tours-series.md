# ADR-27 — Schéma `exercises` v3 : groupes d'exercices (tours / séries / supersets)

- **Statut :** Proposé
- **Date :** 2026-06-11
- **Complète :** ADR-18 (schéma `exercises` v2 — qui avait explicitement reporté les
  schémas imbriqués), `Talent-X_06_Modele_de_donnees.md` §9.1 et §9.3 (versionnement),
  `talent-x-openapi.yaml` (schémas `Exercise`, `ExercisesDoc`)
- **Tickets liés :** TLX-95 (spike, cet ADR), TLX-052 (constructeur C-05), TLX-061
  (blocs circuit mono-station), ADR-19 (results v2 — **non modifié** par cet ADR),
  ADR-20/21 (records & progression — adaptation de lecture seulement)
- **Réf. :** CLAUDE.md règles 5 et 7, retour de test live du 2026-06-10 (création de séance)

## Contexte

### Le problème

Le contrat `exercises` v2 (ADR-18) est une **liste plate de blocs ordonnés**. Il ne
permet pas d'exprimer un **groupe d'exercices répété en tours/séries** — pourtant l'une
des structures les plus fondamentales de la rédaction de séance en athlétisme. Le besoin
a été soulevé en test live par l'exemple : « 2 séries — la 1ʳᵉ avec 3 exercices, la 2ᵈᵉ
avec 2 exercices ».

Les types circuit actuels (`core`/`warmup`/`cooldown`, param `rounds` — TLX-061)
répètent **un seul bloc** : ils ne décrivent pas un enchaînement d'exercices *distincts*
(les stations finissent en `notes`, texte libre non requêtable et non exploitable pour
la saisie de perf).

### Cadrage métier — comment un coach d'athlétisme écrit réellement ses séances

Quatre formats de regroupement couvrent la quasi-totalité de la pratique, toutes
disciplines confondues :

1. **Séries de courses — la notation universelle du sprint/demi-fond** :
   `2 × (3 × 300 m) r = 3′ R = 8′` — des **séries** contenant des **répétitions**, avec
   récupération *intra-série* (`r`, entre répétitions) et *inter-séries* (`R`, entre
   séries). Un bloc `interval` v2 exprime `3 × 300 r3′` ; la dimension « × 2 séries,
   R 8′ » n'existe pas.
2. **Complex / contrast training (force-vitesse)** — le standard de la préparation
   physique des sprinteurs, sauteurs et lanceurs : un **superset** appariant charge
   lourde et geste explosif, enchaînés sans repos puis récupération longue entre tours
   (ex. 4 × [squat 3 reps @ 85 % + bonds horizontaux 5 reps] R = 4′).
3. **Circuits PPG / gainage à stations hétérogènes** : 3 tours de
   [pompes 10 · gainage 45 s · squats sautés 10], enchaînés, R entre tours. Très
   fréquent en période hivernale et chez les jeunes.
4. **Gammes d'échauffement structurées** : 2 passages de [montées de genoux ·
   talons-fesses · griffés · jambes tendues] sur 30 m.

Dans tous ces cas la structure est identique : **un ensemble ordonné d'exercices
distincts, répété N fois, avec récupérations r (intra-tour) et R (inter-tours)**. C'est
ce que modélisent les plateformes de référence (TrainingPeaks « repeats », TrueCoach et
Teambuildr « supersets/groups »).

**Sur la composition variable par tour** (l'exemple du ticket) : en pratique de terrain,
quand la composition change d'une série à l'autre, le coach l'écrit comme **deux séries
distinctes** (« Série 1 : A, B, C » puis « Série 2 : A, B ») — jamais comme un « tour 2
amputé » d'une même série. C'est aussi la forme la plus lisible pour l'athlète. Le
modèle n'a donc **pas** besoin de « tours à composition variable » : il suffit de poser
**plusieurs groupes successifs**.

### Contraintes techniques

- ADR-18 avait écarté l'imbrication **pour le MVP**, pas pour toujours ; sa méthode
  (extension additive versionnée, lecture tolérante) est réutilisable telle quelle.
- La perf (`results` v2, ADR-19) se joint aux blocs par `exerciseName` puis `order` ;
  les records (`record-detection.ts`) lisent les blocs **à plat**. Toute solution doit
  préserver ces jointures.
- `ValidationPipe` global en `forbidNonWhitelisted` : la forme doit être entièrement
  décrite par les DTO.

## Décision (proposée)

**Étendre `exercises` en v3 par un type de nœud `group` à un seul niveau de
profondeur** — même méthode additive que l'ADR-18/19 :

```jsonc
{
  "schemaVersion": 3,
  "items": [
    // Exercice simple : Exercise v2 inchangé (sans `kind` = exercice, rétro-compat).
    { "name": "Footing", "order": 1, "type": "warmup", "durationSeconds": 900 },

    // Groupe (nouveau) : `kind: "group"` obligatoire, items = exercices SEULEMENT.
    {
      "kind": "group",
      "name": "Contraste force-vitesse",
      "order": 2,
      "groupType": "superset",            // superset | circuit | series
      "rounds": 4,                         // nombre de tours/séries (entier ≥ 1)
      "restBetweenItemsSeconds": 0,        // r — récup entre exercices d'un même tour
      "restBetweenRoundsSeconds": 240,     // R — récup entre tours
      "notes": "Lourd puis explosif, enchaîné.",
      "items": [
        { "name": "Squat arrière", "order": 3, "type": "strength",
          "reps": 3, "load": { "value": 85, "unit": "percent_1rm" } },
        { "name": "Bonds horizontaux", "order": 4, "type": "jumps",
          "params": { "fullJumps": 5 } }
      ]
    }
  ]
}
```

Règles du modèle :

1. **Discriminant structurel `kind`** : absent = exercice (toute séance v1/v2 reste
   valide) ; `"group"` = groupe. Un groupe porte `name`, `order`, `groupType?`
   (défaut `circuit`), `rounds` (entier ≥ 1), `restBetweenItemsSeconds?` (r),
   `restBetweenRoundsSeconds?` (R), `notes?`, `items[]`.
2. **Un seul niveau, garanti par construction** : `group.items` est typé
   `Exercise[]` (pas d'union récursive) — un groupe ne peut pas contenir de groupe.
   Pas de validation ad hoc : l'interdiction est structurelle (DTO `GroupDto.items:
   ExerciseDto[]`).
3. **`groupType` est sémantique d'affichage et de guidage**, pas de mécanique :
   `superset` (enchaîné, r ≈ 0, numérotation A1/A2 côté athlète), `circuit` (stations,
   PPG), `series` (séries de courses — un groupe `series` × `rounds` contenant un bloc
   `interval` exprime exactement `R × (n × d) r/R`). La mécanique (tours + r/R) est
   identique pour les trois.
4. **`order` global unique sur tous les nœuds en parcours de lecture** (groupes et
   feuilles confondus). Les **feuilles** gardent ainsi un `order` unique dans la
   séance → les jointures `results` (par `exerciseName` puis `order`) et la détection
   de records fonctionnent **sans aucune modification de contrat** — seule la lecture
   aplatit (`flatMap`) les feuilles des groupes.
5. **Composition variable = plusieurs groupes**. Un groupe a une composition
   constante ; « 2 séries, 1ʳᵉ à 3 exos, 2ᵈᵉ à 2 exos » se pose comme deux groupes
   successifs. Décision ferme : pas de masque par tour.
6. **`sets` masqué dans un groupe** : pour un exercice membre d'un groupe, la dimension
   « série » est portée par `rounds` — le constructeur masque le champ de base `sets`
   (mécanique de visibilité data-driven déjà en place, TLX-94) et ne le sérialise pas.
7. **`schemaVersion: 3`** par défaut pour les nouvelles séances. Lecture tolérante
   v1/v2/v3 (§9.3) ; aucune migration de données.

### Impacts (et non-impacts) en aval

| Surface | Impact |
|---|---|
| `results` v2 (ADR-19) | **Aucun changement de contrat.** Pour un exercice en groupe à N tours, le client pré-pose N lignes de saisie : `setResults[k]` = tour k. |
| Records / progression (ADR-20/21) | **Aucun changement d'eventKey.** `record-detection.ts` aplatit les feuilles avant dérivation (adaptation de lecture, défensive comme aujourd'hui). |
| Constructeur C-05 | « Ajouter un groupe » → carte de groupe (nom, type via chips, tours, r, R) contenant des `BlockCard` standard ; déplacement d'un bloc dans/hors groupe. |
| Affichage athlète A-03/A-04 | Section visuelle « {nom} × {rounds} tours » avec R affiché ; numérotation A1/A2 pour les supersets ; saisie multi-tours pré-posée. |
| Blocs circuit TLX-061 (`rounds` en param) | Conservés (station unique simple). Le groupe devient la forme recommandée pour des stations hétérogènes ; pas de dépréciation dans cet ADR. |

## Conséquences

- **+** Le cœur métier de l'app — la rédaction de séance — couvre enfin les quatre
  structures canoniques de l'entraînement athlétique (séries de courses, contraste,
  circuits, gammes) avec la **notation r/R** que tout coach pratique déjà.
- **+** **Zéro changement** des contrats `results`, records et progression : la valeur
  est obtenue en n'étendant qu'**un seul** document JSONB (la séance), le reste suit
  par aplatissement de lecture.
- **+** Rétro-compatibilité totale (v2 = v3 sans groupes) ; constructeur et éditeurs
  typés existants réutilisés tels quels à l'intérieur des groupes (zéro rework, méthode
  ADR-18).
- **+** Récursion impossible **par construction** (DTO non récursif) : validation,
  UI et saisie restent bornées à deux niveaux connus.
- **−** Surface UI du constructeur sensiblement plus riche (carte de groupe,
  déplacement dans/hors groupe) — le plus gros du coût est là, à découper en tickets.
- **−** Les vues de lecture existantes (détail séance athlète, revue coach C-08,
  pré-remplissage TLX-062) doivent apprendre à rendre les groupes (aplatissement par
  défaut acceptable en transition : les feuilles restent des exercices valides).
- **−** Union discriminée `Exercise | Group` dans `items[]` : validation
  class-transformer par discriminateur (`kind`) + `oneOf` OpenAPI — un cran de
  complexité de plus dans le DTO racine.

## Alternatives écartées

- **Statu quo (liste plate, duplication manuelle des tours)** : pour 3 tours de
  circuit, le coach poserait 3 fois les mêmes blocs → séance verbeuse, saisie athlète
  dupliquée, intention (« c'est un circuit ») perdue. C'est précisément le manque
  remonté en test live. Rejetée.
- **Imbrication récursive complète (groupes de groupes)** : aucune pratique
  d'entraînement réelle ne l'exige (on n'écrit pas des circuits de circuits) ;
  validation, constructeur et saisie deviendraient récursifs. YAGNI. Rejetée.
- **Regroupement par référence (`groupKey` à plat sur chaque exercice)** : préserve la
  platitude du JSON mais intégrité faible (ordre ↔ groupe), reconstruction côté
  client obligatoire, document illisible. La lisibilité du JSONB est une valeur du
  projet (§9). Rejetée.
- **Tours à composition variable (masques d'exercices par tour)** : complexité de
  modèle, de saisie et d'affichage élevée pour un cas que le terrain écrit comme
  plusieurs séries distinctes ; aucune plateforme de référence ne le modélise.
  Rejetée au profit de « un groupe = composition constante ».
- **Étendre les params `rounds` des blocs circuit (TLX-061)** : ne décrit toujours
  qu'un bloc unique — les stations hétérogènes resteraient du texte libre. Rejetée
  comme solution générale (les blocs mono-station restent valides pour les cas
  simples).
