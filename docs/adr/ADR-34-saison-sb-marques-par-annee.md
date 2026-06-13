## ADR-34 — Saison vs carrière : SB (season best) & marques par année, dérivés (complément ADR-20/21)

- **Statut :** Accepté (validé 2026-06-13)
- **Date :** 2026-06-13
- **Décisions validées :** (1) **saison = année civile** (vs split indoor/outdoor deviné par la date — écarté, voir ci-dessous) ; (2) **aucun stockage** — SB et tableau par année **dérivés des performances** (méthode ADR-21) ; (3) exposition **additive sur `ProgressSeries`** (le PB reste la table `personal_records`).
- **Réf. :** Linear TLX-114 · ADR-20 (records `personal_records`, clé d'épreuve) · ADR-21 (`/athletes/me/progress`, `series[].points`) · ADR-19 (mesures typées) · `progress/athlete-progress.service.ts` · `progress/record-detection.ts` (`bestMeasuresByEvent`) · `talent-x-openapi.yaml` (`ProgressSeries`) · TLX-112 (progression coach miroir)

**Contexte.** Le PB (record personnel) est matérialisé par épreuve dans `personal_records`
(ADR-20, une seule meilleure marque, confirmée/manuelle par l'athlète). Mais l'athlète parle
**saison** : le **SB** (meilleure marque de la saison en cours) à côté du PB, et le **tableau de
marques par année** sont le langage natif de tout athlète. Ces deux vues exigent l'**historique
complet** des marques par épreuve — précisément ce que la dérivation de progression (ADR-21)
construit déjà : `ProgressSeries.points` = un point daté (`{date, value}`) par performance qui
mesure l'épreuve. Le ticket demande de trancher **stockage** et **définition de saison**.

**Décision.**

### 1. Saison = année civile (pas de split indoor/outdoor au MVP)

Une marque appartient à la **saison = son année civile** (déduite de `date`, sans saisie). Le
**SB** d'une épreuve = sa meilleure marque (sens `min`/`max` de l'épreuve, ADR-20) sur l'**année
civile en cours** ; le **tableau par année** = meilleure marque + nombre de marques par année.

Le split **indoor/outdoor est écarté** au MVP : aucune performance ne porte de **donnée de lieu**
(salle/plein-air), et l'écrasante majorité des marques sont des **séances d'entraînement** (assignées
par le coach), qui se déroulent en salle ou dehors **indépendamment** de la période de l'année →
classer indoor/outdoor à partir de la seule date serait une heuristique **trompeuse** (un footing de
février n'est pas « indoor »). L'année civile est dérivable sans ambiguïté et reflète fidèlement la
progression année par année. Le split par lieu est un **suivi** qui nécessite un signal de lieu —
naturellement porté par les **résultats de compétition** (TLX-119), où vent/surface/lieu sont saisis.

### 2. Aucun stockage — dérivation à la lecture (méthode ADR-21)

SB et marques par année sont **dérivés des performances** à la lecture, comme les séries d'ADR-21
(zéro table, zéro migration, zéro job). Un module pur `progress/season-marks.ts` :
`seasonAggregates(points, now)` → `{ seasonBest, marksByYear }`, **`now` injecté** (déterminisme,
testable isolément, comme `training-load.ts`). Calculé une fois par épreuve à partir des `points`
déjà accumulés par `AthleteProgressService.derive` — coût négligeable (les points sont en mémoire).

Choisi **contre** une matérialisation (table d'agrégats saison) : prématuré, synchronisation inutile
à ces volumes — même verdict qu'ADR-21. Le SB **bouge** dès qu'une perf arrive : une dérivation est
toujours juste, un agrégat stocké dériverait.

### 3. Exposition — additive sur `ProgressSeries` (le PB reste à `personal_records`)

`ProgressSeries` (ADR-21) gagne **deux champs additifs** :

```
ProgressSeries += {
  seasonBest?:  ProgressPoint            // { date, value } meilleure marque de l'année en cours (absent si aucune)
  marksByYear:  { year, best, count }[]  // décroissant par année — le tableau « marques par année »
}
```

On **n'ajoute pas** de `personalBest` dérivé sur la série : le **PB reste la responsabilité de
`personal_records`** (ADR-20) — donnée *revendiquée* par l'athlète (confirmée ou manuelle/hors-app,
ADR-32), pas un simple agrégat. La série porte le SB et l'historique annuel ; la **même `eventKey`**
(ADR-20) permet à l'UI d'aligner PB (records) et SB (progress) côte à côte sans nouvelle jointure
serveur. Resserrement **rétro-compatible** (champs additifs ; tout client qui les ignore continue).
OpenAPI → DTO Nest → client orval régénéré. La dérivation étant partagée (`derive`), la **progression
coach** (TLX-112, `getForCoach`) hérite **automatiquement** du SB/par-année (l'athlète voit ce que
voit son coach).

### 4. Accès & RGPD — inchangés

Mêmes portes qu'ADR-21 : athlète `data_processing` ; coach lien actif + `coach_access`. SB et
marques par année sont des **dérivations** des performances déjà exportées/effacées (ADR-14/15) —
aucune donnée nouvelle persistée, donc **rien à ajouter** aux manifestes RGPD.

**UI (après acceptation).**

- **A-06 Progression** (`progress-charts.tsx`, écran athlète) : par épreuve, badges **PB · SB** et un
  **tableau compact « marques par année »** (année · meilleure · nb). Réutilisé tel quel par le
  **détail athlète coach** (C-03, `CoachProgressSection`, TLX-112).
- **A-07 Records** (`PersonalRecordsSection`) : sous chaque PB, une ligne **« SB <année> »** lue depuis
  la série de progression de même `eventKey` (le PB vient des records, le SB de la progression).

**Conséquences.**

- **+** Langage athlète (SB + tableau annuel) livré **sans table, sans migration, sans endpoint** ;
  cohérence PB↔SB garantie par la clé d'épreuve unique ; miroir coach gratuit (dérivation partagée) ;
  rétro-compatible ; RGPD inchangé.
- **+** Toujours juste (dérivé) : SB et historique annuel suivent les corrections de perf (ADR-33) et
  les nouvelles marques sans resynchronisation.
- **À assumer :** pas de SB indoor/outdoor distinct (data de lieu absente) — différé à TLX-119 ;
  lecture O(perfs de l'athlète) avec parcours JSONB (déjà le cas ADR-21, volumes individuels faibles) ;
  les épreuves sans mesure (v1, `strength`…) n'alimentent ni série ni SB (assumé, philosophie ADR-21).
- **Écartées :** (a) split indoor/outdoor par date — heuristique trompeuse sur de l'entraînement, sans
  donnée de lieu ; (b) table d'agrégats saison — prématurée, dérive de l'agrégat ; (c) `personalBest`
  dérivé sur la série — empiéterait sur `personal_records` (le PB est revendiqué, pas agrégé) ;
  (d) nouvel endpoint dédié saison — surface inutile, `ProgressSeries` est déjà le bon porteur.

**Périmètre de livraison.** Module pur `progress/season-marks.ts` (`seasonAggregates`, `now` injecté)
+ tests → `ProgressSeriesDto` (+`seasonBest`,`marksByYear`) + `athlete-progress.service` (câblage par
épreuve) + tests → OpenAPI (`ProgressSeries`, `ProgressMarkByYear`) → DTO/orval régénérés → UI A-06
(badges PB·SB + tableau année) & A-07 (ligne SB) + tests → intégration DB-backed (SB année en cours,
tableau multi-années).
