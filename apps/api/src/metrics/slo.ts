/**
 * Évaluation des SLO de performance à partir de l'exposition Prometheus de
 * `GET /metrics` (TLX-76). Brique **codeable** de TLX-138 : la validation de
 * charge exige un environnement prod-like (hors repo), mais « mesurer la latence
 * p95 vs le SLO » et « le taux d'erreur » doit être **reproductible** et
 * **gateable** — pas un calcul à la main dans un rapport.
 *
 * Module **pur** (zéro I/O, zéro dépendance Nest) : on consomme le **texte**
 * d'exposition Prometheus (et non les types internes du service) → le même
 * évaluateur marche contre un `/metrics` réel scrapé par `fetch`, contre un
 * fichier capturé, ou en test. Utilisé par le harnais de charge (`perf/load-test.ts`)
 * et le contrôle SLO (`perf/slo-check.ts`).
 *
 * SLO de référence — TX-OPS-004 §8/§10 : latence **p95 lecture < 1 s**,
 * **taux d'erreur 5xx < 5 %**.
 */

/** Un échantillon Prometheus parsé : `name{labels} value`. */
export interface PromSample {
  name: string;
  labels: Record<string, string>;
  value: number;
}

/** Borne d'histogramme cumulée : `le` (Infinity pour `+Inf`) et compte cumulé. */
export interface HistogramBucket {
  le: number;
  count: number;
}

/** Seuils SLO (TX-OPS-004 §8). */
export interface SloThresholds {
  /** Latence p95 maximale tolérée, en secondes. */
  p95Seconds: number;
  /** Taux d'erreur (5xx) maximal toléré, en fraction (0.05 = 5 %). */
  errorRate: number;
}

export const DEFAULT_SLO: SloThresholds = { p95Seconds: 1, errorRate: 0.05 };

/** Verdict d'évaluation : `ok` + liste lisible des dépassements. */
export interface SloVerdict {
  ok: boolean;
  breaches: string[];
}

/** Résumé SLO dérivé de `/metrics` (ce qui est mesuré, indépendamment du verdict). */
export interface MetricsSloSummary {
  /** p95 de latence (s) sur les séries retenues, `null` si aucune observation. */
  p95Seconds: number | null;
  /** Taux d'erreur 5xx (fraction), `null` si aucune requête comptée. */
  errorRate: number | null;
  /** Volume total de requêtes comptées (dénominateur du taux d'erreur). */
  totalRequests: number;
  /** Nombre de requêtes en 5xx. */
  serverErrors: number;
}

// --- Parsing de l'exposition Prometheus -------------------------------------

const SAMPLE_LINE = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{[^}]*\})?\s+([^\s]+)\s*$/;
const LABEL_PAIR = /([a-zA-Z_][a-zA-Z0-9_]*)="((?:\\.|[^"\\])*)"/g;

/** Déséchappe une valeur de label (inverse de l'échappement de l'exposition). */
function unescapeLabelValue(raw: string): string {
  return raw.replace(/\\(["\\n])/g, (_, c: string) => (c === 'n' ? '\n' : c));
}

/** Parse `value` Prometheus : nombre, ou `+Inf`/`-Inf`/`NaN`. */
function parseValue(raw: string): number {
  if (raw === '+Inf') return Number.POSITIVE_INFINITY;
  if (raw === '-Inf') return Number.NEGATIVE_INFINITY;
  if (raw === 'NaN') return Number.NaN;
  return Number(raw);
}

/**
 * Parse un texte d'exposition Prometheus en échantillons. Ignore les lignes de
 * commentaire (`# HELP`/`# TYPE`) et les lignes vides ; tolère les lignes
 * inattendues (les saute) plutôt que de lever — un `/metrics` reste exploitable
 * même si une ligne est exotique.
 */
export function parsePrometheusText(text: string): PromSample[] {
  const samples: PromSample[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const match = SAMPLE_LINE.exec(trimmed);
    if (!match) continue;
    const [, name, labelBlock, rawValue] = match;
    const labels: Record<string, string> = {};
    if (labelBlock) {
      LABEL_PAIR.lastIndex = 0;
      let pair: RegExpExecArray | null;
      while ((pair = LABEL_PAIR.exec(labelBlock)) !== null) {
        labels[pair[1]] = unescapeLabelValue(pair[2]);
      }
    }
    const value = parseValue(rawValue);
    if (Number.isNaN(value)) continue;
    samples.push({ name, labels, value });
  }
  return samples;
}

// --- Quantile d'histogramme (algorithme Prometheus) -------------------------

/**
 * `histogram_quantile(q, buckets)` — porte fidèle de l'algorithme Prometheus
 * (interpolation linéaire dans le bucket contenant le rang). `buckets` doit
 * inclure la borne `+Inf` (sinon → `null`). Renvoie `null` sans observation.
 *
 * - rang = q × total ; on cible le **premier** bucket dont le cumul ≥ rang ;
 * - si ce bucket est `+Inf`, on renvoie la plus haute borne **finie** (Prometheus
 *   ne peut pas extrapoler au-delà de la dernière borne) ;
 * - sinon, interpolation linéaire entre la borne basse et la borne du bucket.
 */
export function histogramQuantile(buckets: HistogramBucket[], q: number): number | null {
  if (q < 0 || q > 1 || buckets.length === 0) return null;
  const sorted = [...buckets].sort((a, b) => a.le - b.le);
  const last = sorted[sorted.length - 1];
  if (last.le !== Number.POSITIVE_INFINITY) return null; // borne +Inf requise
  const total = last.count;
  if (total <= 0) return null;

  const rank = q * total;
  let b = sorted.findIndex((bucket) => bucket.count >= rank);
  if (b < 0) b = sorted.length - 1;

  // Rang dans le dernier bucket (+Inf) : on plafonne à la plus haute borne finie.
  if (b === sorted.length - 1) return sorted[sorted.length - 2]?.le ?? null;

  let bucketStart = 0;
  const bucketEnd = sorted[b].le;
  let count = sorted[b].count;
  let rankInBucket = rank;
  if (b > 0) {
    bucketStart = sorted[b - 1].le;
    count -= sorted[b - 1].count;
    rankInBucket -= sorted[b - 1].count;
  }
  if (count <= 0) return bucketEnd;
  return bucketStart + (bucketEnd - bucketStart) * (rankInBucket / count);
}

// --- Dérivations HTTP (TLX-76) ----------------------------------------------

const DURATION_BUCKET = 'talentx_http_request_duration_seconds_bucket';
const REQUESTS_TOTAL = 'talentx_http_requests_total';

/** Prédicat de sélection de séries par labels (ex. `{ method: 'GET' }`). */
export type LabelPredicate = (labels: Record<string, string>) => boolean;

/**
 * p95 (ou autre quantile) de latence HTTP agrégée par `le` sur les séries
 * retenues — équivaut à `histogram_quantile(q, sum by (le)(rate(..._bucket)))`.
 * `predicate` filtre les séries (défaut : toutes). `null` si aucune observation.
 */
export function httpDurationQuantile(
  samples: PromSample[],
  q: number,
  predicate: LabelPredicate = () => true,
): number | null {
  const byLe = new Map<number, number>();
  for (const s of samples) {
    if (s.name !== DURATION_BUCKET) continue;
    if (!predicate(s.labels)) continue;
    const le = parseValue(s.labels.le ?? 'NaN');
    if (Number.isNaN(le)) continue;
    byLe.set(le, (byLe.get(le) ?? 0) + s.value);
  }
  if (byLe.size === 0) return null;
  const buckets = Array.from(byLe, ([le, count]) => ({ le, count }));
  return histogramQuantile(buckets, q);
}

/**
 * Taux d'erreur 5xx HTTP = Σ(status 5xx) / Σ(total) sur les séries retenues
 * (`talentx_http_requests_total`). `errorRate` à `null` si aucune requête.
 */
export function httpErrorSummary(
  samples: PromSample[],
  predicate: LabelPredicate = () => true,
): Omit<MetricsSloSummary, 'p95Seconds'> {
  let totalRequests = 0;
  let serverErrors = 0;
  for (const s of samples) {
    if (s.name !== REQUESTS_TOTAL) continue;
    if (!predicate(s.labels)) continue;
    totalRequests += s.value;
    if ((s.labels.status ?? '').startsWith('5')) serverErrors += s.value;
  }
  return {
    totalRequests,
    serverErrors,
    errorRate: totalRequests > 0 ? serverErrors / totalRequests : null,
  };
}

/**
 * Résumé SLO complet à partir du texte `/metrics`. Par défaut, la **p95 lecture**
 * est mesurée sur les `GET` (TX-OPS-004 §8 cible la latence de lecture) et le
 * **taux d'erreur 5xx** sur l'ensemble du trafic.
 */
export function summarizeMetrics(
  text: string,
  opts: { readPredicate?: LabelPredicate; errorPredicate?: LabelPredicate } = {},
): MetricsSloSummary {
  const samples = parsePrometheusText(text);
  const readPredicate = opts.readPredicate ?? ((l) => l.method === 'GET');
  const errorPredicate = opts.errorPredicate ?? (() => true);
  const errors = httpErrorSummary(samples, errorPredicate);
  return {
    p95Seconds: httpDurationQuantile(samples, 0.95, readPredicate),
    ...errors,
  };
}

// --- Évaluation du verdict --------------------------------------------------

/** Formate une fraction en pourcentage lisible (`0.0512` → `5.12 %`). */
function pct(fraction: number): string {
  return `${(fraction * 100).toFixed(2)} %`;
}

/**
 * Confronte un résumé mesuré aux seuils. Une métrique **absente** (`null`, faute
 * d'observation) ne déclenche pas de dépassement : on ne signale que ce qu'on a
 * réellement mesuré (un `/metrics` vide n'est pas une violation de SLO).
 */
export function evaluateSlo(
  summary: Pick<MetricsSloSummary, 'p95Seconds' | 'errorRate'>,
  thresholds: SloThresholds = DEFAULT_SLO,
): SloVerdict {
  const breaches: string[] = [];
  if (summary.p95Seconds !== null && summary.p95Seconds > thresholds.p95Seconds) {
    breaches.push(
      `latence p95 ${summary.p95Seconds.toFixed(3)} s > SLO ${thresholds.p95Seconds} s`,
    );
  }
  if (summary.errorRate !== null && summary.errorRate > thresholds.errorRate) {
    breaches.push(`taux d'erreur 5xx ${pct(summary.errorRate)} > SLO ${pct(thresholds.errorRate)}`);
  }
  return { ok: breaches.length === 0, breaches };
}

// --- Statistiques de latence côté client (harnais de charge) ----------------

/** Résumé de latences observées côté client (en millisecondes). */
export interface LatencySummary {
  count: number;
  min: number;
  max: number;
  mean: number;
  p50: number;
  p95: number;
  p99: number;
}

/**
 * Quantile par interpolation linéaire (méthode « linear » : rang = q×(n−1)).
 * `values` n'a pas besoin d'être trié. `NaN` si vide.
 */
export function percentile(values: number[], q: number): number {
  if (values.length === 0) return Number.NaN;
  if (q <= 0) return Math.min(...values);
  if (q >= 1) return Math.max(...values);
  const sorted = [...values].sort((a, b) => a - b);
  const rank = q * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo);
}

/** Résume une série de latences (ms) : count/min/max/mean/p50/p95/p99. */
export function summarizeLatencies(latenciesMs: number[]): LatencySummary {
  if (latenciesMs.length === 0) {
    return { count: 0, min: 0, max: 0, mean: 0, p50: 0, p95: 0, p99: 0 };
  }
  const sum = latenciesMs.reduce((a, b) => a + b, 0);
  return {
    count: latenciesMs.length,
    min: Math.min(...latenciesMs),
    max: Math.max(...latenciesMs),
    mean: sum / latenciesMs.length,
    p50: percentile(latenciesMs, 0.5),
    p95: percentile(latenciesMs, 0.95),
    p99: percentile(latenciesMs, 0.99),
  };
}
