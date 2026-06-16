# ADR-40 — Cartes d'effort dédiées aussi en édition (inférence de discipline) + fidélité maquette des 4 disciplines restantes

- **Statut :** Accepté (2026-06-16)
- **Date :** 2026-06-16
- **Complète :** ADR-39 (cartes d'effort dédiées, Sprint, **création uniquement**), ADR-38
  (assistants par discipline, contrat de données), ADR-18/27 (`exercises` v3 — `BlockType` +
  groupes `series`)
- **Réf. :** maquettes embarquées dans le fichier prototype fourni (un écran HTML fonctionnel
  par discipline : `sprint`, `hurdles`, `mid` [Demi-fond/Endurance], `jumps`, `throws`),
  CLAUDE.md règle 7 (divergence structurante par rapport à une décision actée → ADR avant code)
- **Tickets liés :** TLX-167 (porté — Haies/Endurance/Sauts/Lancers, livré sans maquette
  spécifique) ; nouveaux TLX-168→171 (cf. §Plan)

## Contexte

### Constat n°1 — fidélité incomplète des 4 disciplines portées par TLX-167

TLX-167 a livré les 4 cartes d'effort restantes (Haies, Endurance, Sauts, Lancers) en s'appuyant
sur le patron Sprint validé (ADR-39) et sur `BLOCK_TYPE_SPECS`, **faute de maquette spécifique**
disponible à ce moment (seule l'image listant les 5 disciplines avait été fournie). Le porteur
produit a ensuite transmis un fichier contenant les **5 prototypes HTML fonctionnels** (un par
discipline, avec `state`, `PRESETS`, calculs dérivés). Comparaison faite : les structures
générales concordent (carte de série, tableau de répétitions, presets, boutons d'action), mais
plusieurs écarts de fidélité existent — listés en détail dans le plan ci-dessous, les plus
significatifs étant :

- Pas de **table de records fictifs** côté TS → aucune **valeur cible réellement calculée**
  (la maquette affiche « ≈ 13″8 », « cible 18,5 m = 92 % du record » ; le code affiche un texte
  générique statique).
- Pas de **collapse/expand** des cartes de série (la maquette replie une série en résumé).
- **Presets** divergents (clés et valeurs chiffrées) par rapport aux 5 prototypes.
- Écarts structurels ponctuels : sous-carte « Ligne de haies » commune (Haies), mode d'intensité
  « spécifique » + zones HR nommées (Endurance), libellé pied d'appel Planche/Zone (Sauts),
  notion de « rounds » absente côté maquette (Lancers).

### Constat n°2 — l'écran d'édition d'une séance existante ignore les cartes dédiées

ADR-39 avait tranché : « édition d'une séance existante : reste en C-05 » — décision actée et
implémentée (`SessionBuilderScreen` : `renderCanvas != null && !isEdit`). Conséquence vérifiée :
une séance **créée** via l'assistant Sprint/Haies/etc. (carte dédiée) est, une fois **rouverte en
édition**, affichée avec l'éditeur générique « Blocs et groupes » — régression d'expérience que
le porteur produit juge incohérente maintenant que les 5 cartes existent. C'est une **divergence
par rapport à une décision actée dans ADR-39** → ADR requis avant de coder (règle 7).

## Décision

### 1. Fidélité maquette — porter les écarts identifiés sur les 4 disciplines

Aligner `hurdles-effort-card.tsx`, `endurance-effort-card.tsx`, `jumps-effort-card.tsx`,
`throws-effort-card.tsx` sur les prototypes fournis, dans la limite du **contrat de données
existant** (additif uniquement, cf. méthode ADR-38 §2) :

- Ajouter une table de records (fictifs, structure `RECORDS` par discipline/sexe/épreuve — même
  esprit que `assistant-presets.ts`) et calculer/afficher la **valeur cible réelle** dérivée
  (temps, distance) dans la note d'intensité de chaque carte.
- Ajouter le **collapse/expand** au niveau `SeriesCardFrame` (primitive partagée
  `effort-card-shared.tsx`) — bénéficie aux 5 disciplines sans dupliquer le code.
- Réaligner les **presets** (clés + valeurs) de `assistant-presets.ts` sur les prototypes.
- Écarts structurels ponctuels : sous-carte « Ligne de haies », mode « spécifique » + zones HR
  nommées (Endurance), libellé Planche/Zone (Sauts — remplace Gauche/Droite), retrait/clarification
  de la notion de rounds (Lancers) si elle s'avère redondante avec le tableau d'ateliers.
- **Conservées comme améliorations** (non présentes dans le prototype mais juteuses, validées
  par le porteur produit) : tableau multi-sauts par série (Sauts) — la maquette n'a qu'un saut
  par atelier, le code permet plusieurs essais hétérogènes par série, ce qui est un sur-ensemble
  utile et reste compatible avec le contrat.

Aucun changement de contrat (`exercises` reste v3, `params` reste additif) : ces écarts sont
de l'**affichage et du calcul côté client**, pas de la donnée stockée.

### 2. Édition : carte dédiée par **inférence de discipline**, avec repli sur l'éditeur générique

On lève la restriction `!isEdit` d'ADR-39, mais **sans** ajouter de champ `discipline` à la
séance (le contrat `Session`/`exercises` n'en a pas, et ADR-38/39 n'en stockent pas) :

- À l'hydratation d'une séance existante (`nodesFromExercises`), une fonction
  `inferDiscipline(nodes): DisciplineKey | null` regarde les `BlockType` des séries/blocs de
  premier niveau (hors `warmup`/`cooldown`) :
  - Tous les blocs significatifs partagent une discipline reconnue
    (`sprint` / `hurdles` / `endurance|interval` / `jumps|vertical_jumps` / `throws`) →
    discipline inférée.
  - Mélange de disciplines, présence de blocs `custom`/`strength`/`core` au premier niveau, ou
    structure non couverte par les 5 cartes → **`null`**, repli sur l'éditeur générique actuel
    (aucune régression : c'est le comportement d'aujourd'hui).
- `SessionBuilderScreen` route alors vers `DISCIPLINE_CANVAS[discipline]` en édition comme en
  création dès que l'inférence réussit ; sinon comportement ADR-39 inchangé.
- Un bandeau discret (« Édition avancée — structure personnalisée ») s'affiche quand on retombe
  en générique **alors que la séance contient au moins un bloc reconnu**, pour que le coach
  comprenne pourquoi il ne voit pas la carte dédiée (évite la confusion silencieuse).
- **Round-trip garanti** : la carte dédiée et l'éditeur générique sérialisent tous deux via
  `nodesToItems()` — aucune perte d'information en repassant de l'un à l'autre.

### 3. Aligner l'écran de détail lecture seule

`CoachSessionDetailScreen` doit refléter la même inférence : si une discipline est détectée,
afficher un résumé compatible avec la carte (mêmes libellés de synthèse que `serieSummary`)
plutôt que le rendu brut des blocs. Repli identique sur le rendu existant si non inféré.

## Conséquences

- **+** Fin de l'incohérence « belle carte à la création, éditeur brut à la modification ».
- **+** Aucune migration, aucun bump de `schemaVersion` : l'inférence est calculée à la volée,
  jamais persistée.
- **+** Les séances créées **avant** cette feature bénéficient aussi de la carte dédiée dès leur
  prochaine ouverture (l'inférence ne dépend que du contenu `exercises`, pas d'un flag historique).
- **+** Le repli generique reste un filet de sécurité pour toute composition libre/hétérogène —
  pas de perte de la flexibilité C-05.
- **−** Risque de divergence future si la carte dédiée évolue sans que l'éditeur générique sache
  toujours round-tripper les mêmes `params` ; mitigé car les deux partagent `nodesToItems`.
- **−** L'inférence peut se tromper sur une séance volontairement mixte mais homogène en
  `BlockType` (ex. un bloc `hurdles` isolé dans une séance par ailleurs en blocs `custom`) ;
  accepté car le critère « tous les blocs significatifs partagent une discipline reconnue » est
  strict — un seul bloc hors-discipline suffit à replier en générique.

## Alternatives écartées

- **Stocker un champ `discipline` explicite sur la séance.** Plus robuste mais touche le contrat
  API/OpenAPI et impose une migration des séances existantes pour les dater rétroactivement —
  rejeté, l'inférence couvre le besoin sans aucun changement de contrat.
- **Garder l'édition toujours en générique (statu quo ADR-39).** Rejeté par décision produit :
  l'incohérence est jugée trop visible maintenant que les 5 cartes existent.
- **Forcer la carte dédiée même sur structure ambiguë (sans repli).** Rejeté : risquerait de
  masquer ou de perdre des blocs non couverts par la carte (ex. bloc `strength` ajouté à la main).

## Plan (tickets — additifs, testés)

1. **TLX-168 (mobile)** — Fidélité maquette : table de records + cible calculée + presets
   réalignés, sur les 4 disciplines + collapse/expand partagé (`effort-card-shared.tsx`).
2. **TLX-169 (mobile)** — `inferDiscipline()` (+ tests unitaires sur cas ambigus/homogènes) et
   câblage dans `SessionBuilderScreen` (lève `!isEdit`, bandeau de repli, tests E2E édition).
3. **TLX-170 (mobile)** — `CoachSessionDetailScreen` : résumé par discipline inférée si
   reconnue, repli sur le rendu existant sinon.
4. **TLX-171 (E2E)** — parcours Playwright : créer une séance Haies via l'assistant → la rouvrir
   en édition → carte dédiée affichée, modification, sauvegarde, round-trip vérifié.

Chaque ticket reste additif, sans migration ni bump de `schemaVersion`.
