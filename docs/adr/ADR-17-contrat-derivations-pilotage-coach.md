# ADR-17 — Contrat explicite des dérivations de pilotage coach (Dashboard/Stats)

- **Statut :** Accepté
- **Date :** 2026-06-09
- **Complète :** `talent-x-openapi.yaml` (schémas `Dashboard`, `Stats`) — Carte C-01 §8
- **Tickets liés :** TLX-080 (dérivations API, livré), TLX-081 (tableau de bord C-01)
- **Réf. :** TX-SPEC-002 §8.7, Carte C-01 §4–8, ADR-07 (REST `/api/v1`),
  client généré orval (`packages/api-client`, source = OpenAPI)

## Contexte

Le contrat d'API définissait `Dashboard` et `Stats` de façon **volontairement
ouverte** au MVP, la forme exacte des KPIs n'étant pas figée :

```yaml
Dashboard: { athletes: UserSummary[], summary: { additionalProperties: true } }
Stats:     { athleteId, metrics: { additionalProperties: true } }
```

TLX-080 a livré et validé des dérivations **concrètes** : statut par athlète
(`late` / `pending_review` / `up_to_date`), compteurs (retards, à revoir), état du
consentement `coach_access`, et agrégats (`toReview`, `today`, alertes). Le client
mobile est **généré par orval depuis l'OpenAPI** (source de vérité, code non éditable).
Tant que `summary`/`metrics` restent des maps opaques (`{[k]: unknown}`), l'écran
C-01 (TLX-081) devrait lire ces données **à l'aveugle**, sans le statut par athlète
qui pilote pourtant les badges du design (« En retard », « À jour »).

Préciser ces schémas **complète le contrat sur un point structurant** (la forme des
dérivations consommée par le front) : cela relève de CLAUDE.md règle 7 (ADR) et touche
`docs/` (règle 5).

## Décision

**Figer dans l'OpenAPI** la forme des dérivations produite par TLX-080, en remplaçant
les maps opaques par des objets explicites :

- **`Dashboard.athletes`** → `DashboardAthlete[]` : `UserSummary` (id, firstName,
  lastName, sport) **enrichi** de `status` (`AthleteStatus`), `overdueCount`,
  `toReviewCount`, `coachAccessGranted`.
- **`Dashboard.summary`** → `DashboardSummary` typé : `athleteCount`, `toReview`,
  `today`, `alerts { missedSessions, consentMissing }`.
- **`Stats.metrics`** → `StatsMetrics` typé : `assignmentsTotal`, `completed`,
  `missed`, `completionRate` (0..1), `avgRpe?` (1..10), `lastPerformanceAt?`.
- **`AthleteStatus`** : enum `up_to_date | late | pending_review`.

Sémantique gelée (cohérente avec TLX-070/080) : **« réalisée »** = affectation
`completed` ; **« à revoir »** = performance soumise **sans commentaire du coach**
(la revue = TLX-086) ; **« retard »** = affectation échue non réalisée ;
**« aujourd'hui »** = échéance du jour non réalisée. Le client `@talent-x/api-client`
est **régénéré** ; les DTOs Nest (`DashboardDto`, `StatsDto`) sont la même forme et
font foi de l'implémentation.

## Conséquences

- **+** Client mobile **typé de bout en bout** ; C-01 consomme le statut par athlète
  et les KPIs sans cast ni lecture défensive.
- **+** La **source de vérité** (OpenAPI) capture enfin le contrat des dérivations ;
  alignement OpenAPI ↔ DTOs Nest ↔ écran.
- **+** Rétrocompatible : ajout de champs sur une structure jusqu'ici ouverte, aucun
  champ existant retiré (`athletes`, `athleteId`, `metrics` préservés).
- **−** Toute évolution future d'un KPI = modification de schéma + régénération du
  client (c'est l'effet recherché d'un contrat). Les sous-sections « À revoir »
  (TLX-082) et « Aujourd'hui » (TLX-083) s'inscriront **dans** cette forme.
- **−** Couplage assumé entre la forme des dérivations et le contrat public ; les
  agrégats restent des nombres simples (pas de pagination) — adapté au volume MVP.

## Alternatives écartées

- **Types locaux côté app** (garder l'OpenAPI opaque, redéclarer la forme en TS dans
  le mobile) : rapide mais place le contrat **hors de la source de vérité**, au risque
  de dérive silencieuse entre back et front. Rejetée.
- **Consommer des `unknown`** (lecture défensive) : perd le typage et **le statut par
  athlète**, cœur du design C-01. Rejetée.
- **Garder `additionalProperties: true` en y ajoutant des exemples** : documente sans
  typer ; le client généré resterait opaque. Rejetée.
