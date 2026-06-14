# Observabilité — supervision de la file de jobs (TLX-83)

Reliquat observabilité de TLX-035. Le worker BullMQ, le stockage S3 et la
journalisation sont livrés (TLX-035 / TLX-82) ; ce volet ajoute la **supervision
opérationnelle de la file** `data-export` : profondeur, échecs, jobs retardés.

Aligné sur **ADR-11** (observabilité **managée** au MVP, auto-hébergée plus tard)
et **TX-OPS-004 §7** : on **expose** des métriques au format standard, la
plateforme managée se charge du stockage, des dashboards et du routage d'alertes.
Aucun dashboard ni pile (Prometheus/Grafana/Loki) n'est auto-hébergé ici.

## Endpoint `GET /metrics`

- **Hors** préfixe `/api/v1` et **hors** contrat OpenAPI : endpoint d'exploitation,
  pas une route métier. Servi à la racine (`/metrics`), convention de scrape.
- Format : exposition Prometheus texte v0.0.4 (`Content-Type:
text/plain; version=0.0.4`).
- **Authentification de scrape** optionnelle via `METRICS_TOKEN` :
  - défini → `Authorization: Bearer <token>` exigé (401 sinon) ;
  - absent → endpoint ouvert (dev, ou prod derrière un réseau restreint).
    Aucun secret en dur ; le jeton est un secret d'environnement.
- Ne tombe jamais : si Redis est injoignable, l'endpoint répond quand même avec
  `talentx_export_queue_up 0` (le scrapeur en déduit la panne).

### Métriques exposées

| Métrique                                                         | Type  | Description                                       |
| ---------------------------------------------------------------- | ----- | ------------------------------------------------- |
| `talentx_export_queue_up{queue="data-export"}`                   | gauge | File joignable (1) ou non (0)                     |
| `talentx_export_queue_jobs{queue="data-export",state="waiting"}` | gauge | Profondeur — en attente                           |
| `…state="active"`                                                | gauge | En cours de traitement                            |
| `…state="completed"`                                             | gauge | Terminés (conservés, `removeOnComplete`)          |
| `…state="failed"`                                                | gauge | En échec (conservés jusqu'à 1000, `removeOnFail`) |
| `…state="delayed"`                                               | gauge | Retardés (backoff / rejeu)                        |
| `…state="paused"`                                                | gauge | En pause                                          |

Couvre les métriques de file listées en TX-OPS-004 §7 : profondeur, jobs en
échec, jobs retardés/rejoués.

> **Latence de traitement (histogramme).** Non incluse au MVP : elle suppose une
> instrumentation côté worker (durée `processing → ready`). La profondeur
> `waiting` + les échecs sont les signaux d'engorgement actionnables visés par
> §7.1. Histogramme de durée → V2 (instrumentation worker).

### Métriques HTTP applicatives (TLX-76)

Le même `/metrics` expose les signaux HTTP de TX-OPS-004 §7 (taux d'erreur,
latence p95, volume d'appels, connexions actives) :

| Métrique                                               | Type      | Description                                                        |
| ------------------------------------------------------ | --------- | ------------------------------------------------------------------ |
| `talentx_http_requests_in_flight`                      | gauge     | Requêtes HTTP en cours (connexions actives)                        |
| `talentx_http_requests_total{method,route,status}`     | counter   | Volume d'appels ; le **taux d'erreur** se dérive du label `status` |
| `talentx_http_request_duration_seconds_bucket{...,le}` | histogram | Latence ; la **p95** se dérive via `histogram_quantile`            |

Le label `route` est le **gabarit** (`/api/v1/athletes/:id/progress`), jamais
l'URL brute → cardinalité bornée. Une borne d'histogramme tombe exactement à
**1 s** → la p95 du SLO (§8) se lit sans interpolation grossière.

## Alerting

Règles déclaratives, à charger dans la plateforme managée (ou un Prometheus
ultérieur). Seuils **indicatifs**, à affiner avec le trafic réel (§7.2 : alertes
reliées aux SLO / au burn-rate).

**File de jobs** — [`ops/alerts/data-export-queue.rules.yml`](alerts/data-export-queue.rules.yml) (mapping TX-OPS-004 §7.1) :

| Alerte                   | Sévérité | Condition (résumé)                     |
| ------------------------ | -------- | -------------------------------------- |
| `DataExportQueueDown`    | critique | `queue_up == 0` pendant 2 min          |
| `DataExportQueueStalled` | critique | > 20 en attente **et** 0 actif, 10 min |
| `DataExportQueueBacklog` | haute    | > 50 en attente, 10 min                |
| `DataExportJobsFailing`  | haute    | > 10 en échec, 10 min                  |
| `DataExportJobsDelayed`  | moyenne  | > 20 retardés, 30 min                  |

**SLO HTTP** — [`ops/alerts/http-slo.rules.yml`](alerts/http-slo.rules.yml) (mapping TX-OPS-004 §8, TLX-138) :

| Alerte                       | Sévérité | Condition (résumé)                          |
| ---------------------------- | -------- | ------------------------------------------- |
| `HttpErrorRateHigh`          | critique | taux 5xx > 5 % (trafic significatif), 5 min |
| `HttpReadLatencyP95High`     | haute    | p95 GET > 1 s, 5 min                        |
| `HttpReadLatencyP95Elevated` | moyenne  | p95 GET > 0,7 s, 15 min (marge SLO réduite) |
| `HttpInFlightSaturation`     | moyenne  | requêtes en vol moy. > 50, 10 min           |

## Configuration scrape (exemple)

```yaml
# prometheus.yml (côté plateforme managée)
scrape_configs:
  - job_name: talentx-api
    metrics_path: /metrics
    authorization:
      type: Bearer
      credentials: ${METRICS_TOKEN} # injecté par la plateforme, jamais commité
    static_configs:
      - targets: ['api:3000']
```

## Validation de charge & contrôle SLO (TLX-138)

Outillage **reproductible** (sans dépendance externe, `fetch` natif) pour
valider la latence p95 et le taux d'erreur vs le SLO (TX-OPS-004 §6/§8). La
logique d'agrégation (percentiles, `histogram_quantile`, verdict) vit dans le
module **pur et testé** `src/metrics/slo.ts` — source unique partagée par les
deux outils.

- **Harnais de charge** — `pnpm --filter @talent-x/api perf:load` (ou
  `tsx perf/load-test.ts`). Hammer une route par **paliers** de concurrence,
  mesure p50/p95/p99 + débit + taux d'erreur côté client, **sort en code 1** si
  le SLO est dépassé. Exemple :

  ```bash
  tsx perf/load-test.ts \
    --url http://localhost:3000/api/v1/coach/dashboard \
    --header "Authorization: Bearer <jwt>" \
    --stages 10,50,100 --duration 10 \
    --metrics-url http://localhost:3000/metrics   # croise avec ce que /metrics a enregistré
  ```

- **Contrôle SLO** — `pnpm --filter @talent-x/api slo:check` (ou
  `tsx perf/slo-check.ts`). Scrape `/metrics`, dérive p95 (lecture) + taux 5xx,
  **sort en code 1** si dépassement → porte de CI ou contrôle d'astreinte :

  ```bash
  tsx perf/slo-check.ts                         # http://localhost:3000/metrics
  METRICS_TOKEN=… tsx perf/slo-check.ts          # scrape protégé
  curl -s localhost:3000/metrics | tsx perf/slo-check.ts --stdin
  tsx perf/slo-check.ts --p95 0.8 --error-rate 0.02   # seuils stricts
  ```

Rapport de charge **local** (paliers, p95, point de saturation) :
[`perf/TLX-138-local-load-report.md`](../perf/TLX-138-local-load-report.md). La
validation **prod-like** dimensionnée reste à rejouer sur l'environnement cible
(env requis, hors repo).

## Runbook (extrait — TX-OPS-004 §12)

- **Quotidien** : état de la file (profondeur `waiting`, `failed`) via le
  dashboard managé ou `curl -s localhost:3000/metrics | grep queue_jobs`.
- **Avant chaque palier de charge** (§6) : `perf:load` sur les routes de lecture
  clés (`/health`, `/coach/dashboard`) + `slo:check` → valider p95 < 1 s et
  taux d'erreur < 5 % avant de monter en capacité.
- **Alerte `HttpReadLatencyP95High`** : identifier les routes lentes
  (`talentx_http_request_duration_seconds` par `route`) ; cause fréquente =
  agrégations dashboard sous volume, ou plafond mono-nœud → scaler
  horizontalement (cf. rapport de charge). **Alerte `HttpErrorRateHigh`** :
  corréler par `route`/`status`, inspecter les logs (correlation id) et
  `/api/v1/ready`.
- **Alerte `…QueueDown` / `…Stalled`** : vérifier Redis (`/api/v1/ready`), le
  process worker (`node dist/worker.js` / `worker:dev`), les logs
  (`event=data.export status=failed`). Redémarrer le worker ; les jobs en attente
  sont repris automatiquement (idempotents, `jobId` = id `export_jobs`).
- **Alerte `…JobsFailing`** : cause fréquente = S3 (config/credentials) ou base.
  Inspecter le message d'erreur persité sur la ligne `export_jobs.error`.
