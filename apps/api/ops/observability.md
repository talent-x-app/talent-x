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

## Alerting

Règles déclaratives : [`ops/alerts/data-export-queue.rules.yml`](alerts/data-export-queue.rules.yml).
À charger dans la plateforme managée (ou un Prometheus ultérieur). Seuils
**indicatifs**, à affiner avec le trafic réel (§7.2 : alertes reliées aux SLO /
au burn-rate). Mapping TX-OPS-004 §7.1 :

| Alerte                   | Sévérité | Condition (résumé)                     |
| ------------------------ | -------- | -------------------------------------- |
| `DataExportQueueDown`    | critique | `queue_up == 0` pendant 2 min          |
| `DataExportQueueStalled` | critique | > 20 en attente **et** 0 actif, 10 min |
| `DataExportQueueBacklog` | haute    | > 50 en attente, 10 min                |
| `DataExportJobsFailing`  | haute    | > 10 en échec, 10 min                  |
| `DataExportJobsDelayed`  | moyenne  | > 20 retardés, 30 min                  |

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

## Runbook (extrait — TX-OPS-004 §12)

- **Quotidien** : état de la file (profondeur `waiting`, `failed`) via le
  dashboard managé ou `curl -s localhost:3000/metrics | grep queue_jobs`.
- **Alerte `…QueueDown` / `…Stalled`** : vérifier Redis (`/api/v1/ready`), le
  process worker (`node dist/worker.js` / `worker:dev`), les logs
  (`event=data.export status=failed`). Redémarrer le worker ; les jobs en attente
  sont repris automatiquement (idempotents, `jobId` = id `export_jobs`).
- **Alerte `…JobsFailing`** : cause fréquente = S3 (config/credentials) ou base.
  Inspecter le message d'erreur persité sur la ligne `export_jobs.error`.
