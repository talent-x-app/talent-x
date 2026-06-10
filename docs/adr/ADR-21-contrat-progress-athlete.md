# ADR-21 — Contrat explicite de la progression athlète (`/athletes/me/progress`)

- **Statut :** Accepté
- **Date :** 2026-06-10 (validé 2026-06-10)
- **Complète :** `talent-x-openapi.yaml` (schéma `Progress` — aujourd'hui conteneurs
  libres `metrics`/`series`), TX-SPEC-002 (A-06)
- **Tickets liés :** TLX-090 (écran Progression A-06, graphes par discipline) —
  **bloqué par cet ADR** ; l'endpoint `GET /athletes/me/progress` est un squelette 501.
- **Réf. :** **ADR-17** (méthode : contrat explicite des dérivations Dashboard/Stats),
  ADR-19 (mesures v2 — la matière première), ADR-20 (clé d'épreuve dérivée,
  `record-detection`), CLAUDE.md règle 7.

## Contexte

A-06 demande des **graphes de progression par discipline** côté athlète. Or le schéma
`Progress` du contrat est un conteneur libre (`metrics: object`,
`series: object[]` en `additionalProperties: true`) et l'endpoint répond 501. Depuis
l'ADR-19, les performances portent des **mesures typées** (`timeSeconds`,
`distanceMeters`) et l'ADR-20 a fixé la **clé d'épreuve** (`sprint:60m`, `jumps`…) et sa
dérivation (`record-detection`, backend). Il manque la forme exacte de la réponse —
même besoin de dérivations explicites que l'ADR-17 pour le coach.

## Décision (proposée)

**Préciser `Progress` en s'appuyant sur les briques existantes** (aucune nouvelle
table, dérivation à la lecture) :

1. **`series[]` — une série par épreuve** (schéma `ProgressSeries`) :
   `{ eventKey, label, unit ('s'|'m'), direction ('min'|'max'), points: [{ date,
   value }] }`. Un **point par performance soumise** qui mesure l'épreuve : `value` =
   **meilleure marque de la perf** sur l'épreuve (réutilise `bestMeasuresByEvent` de
   l'ADR-20), `date` = `submittedAt` (date ISO). Points ordonnés par date croissante ;
   épreuves dérivées des blocs typés de la séance liée (jointure ADR-19). Les séries
   sont triées par `label`. Le découpage Semaine/Mois/Année reste **côté client**
   (pas de paramètre de fenêtre au MVP — volumes faibles, simplicité).
2. **`metrics` — mêmes dérivations que `StatsMetrics`** (ADR-17), appliquées à
   l'athlète connecté sur **toutes** ses affectations actives (tous coachs) :
   `assignmentsTotal`, `completed`, `missed`, `completionRate`, `avgRpe`,
   `lastPerformanceAt`. Le schéma OpenAPI référence `StatsMetrics` (une seule
   définition).
3. **Accès** : athlète sur ses propres données, consentement `data_processing` actif
   (même porte que la saisie — donnée de santé dérivée) ; pas de variante coach ici
   (le coach a Stats/records, ADR-17/20).

**Compatibilité.** Resserrement **compatible** du contrat : `metrics`/`series` étaient
des objets libres, ils deviennent typés — tout client existant qui les ignorait
continue de fonctionner ; l'endpoint passait 501 → 200, aucun consommateur en
production.

## Conséquences

- **+** A-06 a un contrat stable et **les graphes se branchent directement** sur
  `series[].points` ; la cohérence épreuve ↔ records (A-07) est garantie par la même
  clé (ADR-20).
- **+** Zéro migration : dérivation à la lecture, briques `record-detection`
  réutilisées telles quelles.
- **−** Lecture O(perfs de l'athlète) avec parcours des JSONB : acceptable au MVP
  (volumes individuels faibles) ; une fenêtre `?days=` pourra être ajoutée (additif)
  si besoin.
- **−** Les exercices v1 sans mesures n'alimentent aucune série (seul `metrics` les
  reflète) — assumé, même philosophie que TLX-062/076.

## Alternatives écartées

- **Laisser `metrics`/`series` libres** et dériver côté client en listant toutes les
  perfs : N lectures lourdes côté mobile, logique d'épreuve dupliquée (drift avec
  ADR-20), contrat flou. Rejetée (même motif qu'ADR-17).
- **Agrégats matérialisés** (table de séries) : prématuré, complexité de
  synchronisation sans volumétrie qui le justifie. Rejetée.
- **Paramètre de fenêtre serveur (`?days=`)** dès le MVP : ajoute de la surface pour un
  gain nul à ces volumes ; le client segmente. Écartée (additif plus tard).
