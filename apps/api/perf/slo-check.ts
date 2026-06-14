/**
 * Contrôle SLO — TLX-138. Scrape `GET /metrics` (TLX-76), dérive la latence p95
 * de lecture et le taux d'erreur 5xx, les confronte au SLO (TX-OPS-004 §8 :
 * p95 < 1 s, erreur < 5 %) et **sort en code 1 si dépassement** → utilisable en
 * porte de CI ou en contrôle d'astreinte (`curl`/cron). Réutilise l'évaluateur
 * pur et testé `src/metrics/slo.ts` (source unique de vérité).
 *
 * Aucune dépendance externe : `fetch` natif (Node ≥ 18). Aucun secret en dur —
 * le jeton de scrape éventuel vient de l'environnement (`METRICS_TOKEN`).
 *
 * Usage :
 *   tsx perf/slo-check.ts                       # scrape http://localhost:3000/metrics
 *   METRICS_URL=https://api/metrics tsx perf/slo-check.ts
 *   METRICS_TOKEN=… tsx perf/slo-check.ts        # scrape protégé
 *   tsx perf/slo-check.ts --file metrics.txt     # depuis un fichier capturé
 *   cat metrics.txt | tsx perf/slo-check.ts --stdin
 *   tsx perf/slo-check.ts --p95 0.8 --error-rate 0.02   # seuils personnalisés
 */
import { readFileSync } from 'node:fs';
import { DEFAULT_SLO, evaluateSlo, summarizeMetrics, type SloThresholds } from '../src/metrics/slo';

interface Options {
  url: string;
  token?: string;
  file?: string;
  stdin: boolean;
  thresholds: SloThresholds;
}

function parseArgs(argv: string[]): Options {
  const opts: Options = {
    url: process.env.METRICS_URL ?? 'http://localhost:3000/metrics',
    token: process.env.METRICS_TOKEN?.trim() || undefined,
    stdin: false,
    thresholds: { ...DEFAULT_SLO },
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = (): string => argv[(i += 1)];
    switch (arg) {
      case '--file':
        opts.file = next();
        break;
      case '--stdin':
        opts.stdin = true;
        break;
      case '--p95':
        opts.thresholds.p95Seconds = Number(next());
        break;
      case '--error-rate':
        opts.thresholds.errorRate = Number(next());
        break;
      case '--url':
        opts.url = next();
        break;
      default:
        throw new Error(`Argument inconnu : ${arg}`);
    }
  }
  return opts;
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

async function loadMetricsText(opts: Options): Promise<string> {
  if (opts.file) return readFileSync(opts.file, 'utf8');
  if (opts.stdin) return readStdin();
  const headers: Record<string, string> = {};
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const res = await fetch(opts.url, { headers });
  if (!res.ok) throw new Error(`GET ${opts.url} → HTTP ${res.status}`);
  return res.text();
}

function fmt(value: number | null, unit: string): string {
  return value === null ? 'n/a' : `${value}${unit}`;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const text = await loadMetricsText(opts);
  const summary = summarizeMetrics(text);
  const verdict = evaluateSlo(summary, opts.thresholds);

  const source = opts.file ?? (opts.stdin ? '<stdin>' : opts.url);
  console.log(`Contrôle SLO — source : ${source}`);
  console.log(
    `  requêtes comptées : ${summary.totalRequests} (dont 5xx : ${summary.serverErrors})`,
  );
  console.log(
    `  latence p95 (GET) : ${fmt(summary.p95Seconds === null ? null : Number(summary.p95Seconds.toFixed(3)), ' s')}` +
      `  (SLO < ${opts.thresholds.p95Seconds} s)`,
  );
  console.log(
    `  taux d'erreur 5xx : ${fmt(summary.errorRate === null ? null : Number((summary.errorRate * 100).toFixed(2)), ' %')}` +
      `  (SLO < ${(opts.thresholds.errorRate * 100).toFixed(0)} %)`,
  );

  if (verdict.ok) {
    console.log('✅ SLO respecté.');
    process.exit(0);
  }
  console.error('❌ SLO dépassé :');
  for (const breach of verdict.breaches) console.error(`   - ${breach}`);
  process.exit(1);
}

main().catch((err) => {
  console.error(`slo-check: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(2);
});
