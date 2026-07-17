# TLX-138 — Rapport de charge (local) + seuils d'alerte

> **Périmètre.** Validation de charge **locale** (poste de dev) — première passe pour
> dégrossir le profil latence/saturation et **vérifier que les signaux exposés sur `/metrics`
> sont exploitables** (TLX-76). La validation **prod-like** (API + worker + base + cache +
> reverse proxy dimensionnés, jeu de données réaliste) et le **branchement effectif des règles
> d'alerte dans l'observabilité managée (ADR-11)** restent **hors périmètre de ce poste** —
> voir « Reste à faire » en bas.

## Environnement de test

- API : `nest start` (mode dev, **un seul nœud**, Node 22), Postgres `:5433` + Redis `:6379` + MinIO `:9000` (Docker).
- Outil : `autocannon` v8 pour cette passe initiale. Un **harnais reproductible sans dépendance** est désormais committé — `perf/load-test.ts` (paliers, p50/p95/p99, débit, verdict SLO) — rejouable partout (`fetch` natif, ni `autocannon` ni `k6` à installer). Client sur la **même machine** que l'API → la latence inclut la contention CPU locale, pessimiste.
- Jeu de données : **1 coach / 1 athlète / 1 séance** (dashboard léger) → mesure le **coût de chemin**, pas le coût volumétrique.
- SLO de référence : **p95 lecture < 1 s**, **taux d'erreur < 5 %** (TX-OPS-004 §8/§10).

## Résultats (latence observée côté client)

| Scénario                        | Conns | Durée | req/s moy | p50    | p95        | p99    | max    | 2xx  | non-2xx | erreurs | timeouts |
| ------------------------------- | ----- | ----- | --------- | ------ | ---------- | ------ | ------ | ---- | ------- | ------- | -------- |
| `/health` (baseline sans DB)    | 50    | 10 s  | 968       | 41 ms  | 170 ms     | 220 ms | 478 ms | 9683 | 0       | 0       | 0        |
| `/coach/dashboard` (lecture DB) | 10    | 12 s  | 289       | 33 ms  | **44 ms**  | 51 ms  | 121 ms | 3464 | 0       | 0       | 0        |
| `/coach/dashboard`              | 50    | 12 s  | 294       | 167 ms | **211 ms** | 257 ms | 284 ms | 3531 | 0       | 0       | 0        |
| `/coach/dashboard`              | 100   | 12 s  | 298       | 328 ms | **393 ms** | 401 ms | 460 ms | 3580 | 0       | 0       | 0        |

**Lecture.**

- **SLO p95 < 1 s tenu** sur tous les paliers (max observé 393 ms à 100 connexions concurrentes).
- **Taux d'erreur = 0 %** (aucun 4xx/5xx, aucun timeout) sur ~24 000 requêtes cumulées.
- **Point de saturation** : le débit du dashboard **plafonne ~290–300 req/s** dès 10 connexions ; au-delà, ajouter des connexions **n'augmente plus le débit** mais **gonfle la latence linéairement** (p50 33→167→328 ms). Goulot = **traitement par requête sur un seul nœud** (dev, mono-process), pas la base. → en prod, **scaler horizontalement** (plusieurs instances API derrière le reverse proxy) pour lever ce plafond.

## Croisé serveur — `/metrics` exploitable (TLX-76)

La dérivation des SLO depuis `/metrics` est désormais **codée et testée** (module
pur `src/metrics/slo.ts` : parsing exposition Prometheus, `histogram_quantile`,
taux d'erreur 5xx, verdict) et exposée en CLI `perf/slo-check.ts` (**sort en
code 1 si dépassement** → gateable). Les signaux nécessaires aux alertes sont
**bien exposés et dérivables** :

- **Latence p95 par route** via l'histogramme (bornes dont **une exactement à 1 s**) :
  `talentx_http_request_duration_seconds_bucket{route="/api/v1/coach/dashboard",...}` →
  sur ~10 700 requêtes, **10 028 ≤ 0,25 s** et **10 744 ≤ 0,5 s** → `histogram_quantile(0.95, …) ≈ 0,26 s` (paliers confondus). Cohérent avec autocannon.
- **Taux d'erreur** via `talentx_http_requests_total{status=…}` (ici 200 + quelques 304 conditionnels, **0 en 4xx/5xx**).
- **Connexions actives** via `talentx_http_requests_in_flight` (retombe à 0 au repos).

## Règles d'alerte (ADR-11, observabilité managée)

Les règles SLO HTTP sont désormais **committées comme config déclarative** :
[`ops/alerts/http-slo.rules.yml`](../ops/alerts/http-slo.rules.yml) (taux 5xx

> 5 %, p95 lecture > 1 s + pré-alerte 0,7 s, saturation connexions actives) —
> mêmes seuils §8, prêtes à charger dans la plateforme managée. Les alertes de
> file vivent déjà dans [`ops/alerts/data-export-queue.rules.yml`](../ops/alerts/data-export-queue.rules.yml).
> Cœur des expressions (PromQL) :

```promql
# Taux d'erreur 5xx > 5 % sur 5 min
sum(rate(talentx_http_requests_total{status=~"5.."}[5m]))
  / sum(rate(talentx_http_requests_total[5m])) > 0.05

# Latence p95 (lecture) > 1 s sur 5 min
histogram_quantile(0.95,
  sum by (le) (rate(talentx_http_request_duration_seconds_bucket{method="GET"}[5m]))) > 1
```

## Campagne 2026-07-17 — harnais committé (`perf/load-test.ts`), paliers + saturation

Rejouée avec le **harnais reproductible** (plus d'autocannon) contre la stack locale complète
(API `nest start` mono-nœud, Postgres :5433, Redis :6379). Coach dédié fraîchement créé (dashboard
léger → coût de chemin). Croisé serveur `/metrics` activé (`--metrics-url`).

| Scénario                        | Conns | Durée | req/s | p50     | p95         | p99     | max     | non-2xx | err |
| ------------------------------- | ----- | ----- | ----- | ------- | ----------- | ------- | ------- | ------- | --- |
| `/health` (baseline sans DB)    | 10    | 10 s  | 1158  | 8 ms    | 16 ms       | 24 ms   | 128 ms  | 0       | 0   |
| `/health`                       | 50    | 10 s  | 1604  | 29 ms   | 49 ms       | 69 ms   | 110 ms  | 0       | 0   |
| `/health`                       | 100   | 10 s  | 1569  | 61 ms   | 94 ms       | 122 ms  | 166 ms  | 0       | 0   |
| `/coach/dashboard` (lecture DB) | 10    | 10 s  | 252   | 36 ms   | **66 ms**   | 92 ms   | 287 ms  | 0       | 0   |
| `/coach/dashboard`              | 50    | 10 s  | 328   | 137 ms  | **246 ms**  | 339 ms  | 427 ms  | 0       | 0   |
| `/coach/dashboard`              | 100   | 10 s  | 364   | 261 ms  | **409 ms**  | 487 ms  | 570 ms  | 0       | 0   |
| `/coach/dashboard` (saturation) | 200   | 10 s  | 317   | 624 ms  | **842 ms**  | 949 ms  | 1012 ms | 0       | 0   |
| `/coach/dashboard` (saturation) | 400   | 10 s  | 387   | 1023 ms | **1553 ms** | 2710 ms | 3138 ms | 0       | 0   |

**Lecture.**

- **SLO p95 < 1 s tenu jusqu'à 200 connexions** sur la lecture DB la plus lourde (842 ms) ;
  **dépassé à 400** (1,55 s — le harnais sort bien en **code 1**, verdict automatique vérifié).
- **Taux d'erreur strictement 0** (aucun 4xx/5xx, aucun timeout) sur ~60 000 requêtes cumulées,
  y compris au-delà de la saturation : l'API **dégrade en latence, pas en erreurs**.
- **Point de saturation confirmé** : débit dashboard plafonné **~320–390 req/s** dès 50 connexions
  (mono-process dev) — au-delà, la concurrence ne paie qu'en latence. `/health` plafonne ~1 600 req/s.
- **Croisé serveur cohérent** : `/metrics` → p95 GET 0,164 s (paliers 10–100 confondus), 0 % 5xx —
  la chaîne `histogram_quantile` de `slo.ts` recoupe la mesure client.

## Reste à faire (hors périmètre de ce poste — environnement requis)

1. **Charge prod-like** : rejouer les paliers (via `perf/load-test.ts`) contre l'environnement cible dimensionné (TX-OPS-004 §6 — valider p95 + capacité **avant chaque palier**), avec un **jeu de données réaliste** (centaines d'athlètes/séances) pour mesurer le **coût volumétrique** du dashboard (agrégations), pas seulement le coût de chemin.
2. **Charger** `ops/alerts/http-slo.rules.yml` dans l'observabilité **managée** (ADR-11) + routage d'astreinte (les règles sont écrites ; reste leur déploiement côté plateforme — hors repo).
3. Confirmer le **point de saturation réel** multi-nœuds (le plafond ~300 req/s ici est un artefact mono-process dev).
