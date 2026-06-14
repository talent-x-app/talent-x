/**
 * Harnais de charge **reproductible** — TLX-138. Hammer une route par paliers de
 * concurrence (TX-OPS-004 §6 : « avant chaque palier, valider latence p95 et
 * capacité »), mesure la latence côté client (p50/p95/p99), le débit et le taux
 * d'erreur, puis confronte au SLO (p95 < 1 s, erreur < 5 % — §8) et **sort en
 * code 1 si dépassement**.
 *
 * Sans dépendance externe (`fetch` natif Node ≥ 18, pas d'`autocannon`/`k6` à
 * installer → rejouable partout, y compris en CI). Les agrégats (percentiles,
 * résumé) viennent du module pur et testé `src/metrics/slo.ts`. Pour une charge
 * **prod-like** dimensionnée, voir `perf/TLX-138-local-load-report.md` ; k6 reste
 * possible pour des scénarios multi-étapes plus riches (script non requis ici).
 *
 * Usage :
 *   tsx perf/load-test.ts --url http://localhost:3000/api/v1/health
 *   tsx perf/load-test.ts --url http://localhost:3000/api/v1/coach/dashboard \
 *     --header "Authorization: Bearer <jwt>" --stages 10,50,100 --duration 10
 *   tsx perf/load-test.ts --url … --metrics-url http://localhost:3000/metrics  # + croisé serveur
 */
import {
  DEFAULT_SLO,
  evaluateSlo,
  summarizeLatencies,
  summarizeMetrics,
  type LatencySummary,
} from '../src/metrics/slo';

interface Options {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  stages: number[];
  durationSeconds: number;
  metricsUrl?: string;
}

function parseArgs(argv: string[]): Options {
  const opts: Options = {
    url: 'http://localhost:3000/api/v1/health',
    method: 'GET',
    headers: {},
    stages: [10, 50, 100],
    durationSeconds: 10,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = (): string => argv[(i += 1)];
    switch (arg) {
      case '--url':
        opts.url = next();
        break;
      case '--method':
        opts.method = next().toUpperCase();
        break;
      case '--header': {
        const raw = next();
        const idx = raw.indexOf(':');
        if (idx < 0) throw new Error(`En-tête mal formé (attendu "Clé: valeur") : ${raw}`);
        opts.headers[raw.slice(0, idx).trim()] = raw.slice(idx + 1).trim();
        break;
      }
      case '--body':
        opts.body = next();
        break;
      case '--stages':
        opts.stages = next()
          .split(',')
          .map((s) => Number(s.trim()))
          .filter((n) => Number.isFinite(n) && n > 0);
        break;
      case '--duration':
        opts.durationSeconds = Number(next());
        break;
      case '--metrics-url':
        opts.metricsUrl = next();
        break;
      default:
        throw new Error(`Argument inconnu : ${arg}`);
    }
  }
  if (opts.stages.length === 0) throw new Error('--stages vide');
  return opts;
}

interface StageResult {
  conns: number;
  durationSeconds: number;
  total: number;
  byClass: Record<string, number>; // '2xx' | '3xx' | '4xx' | '5xx' | 'err'
  latency: LatencySummary;
}

function statusClass(status: number): string {
  if (status >= 500) return '5xx';
  if (status >= 400) return '4xx';
  if (status >= 300) return '3xx';
  if (status >= 200) return '2xx';
  return 'err';
}

/** Joue un palier : `conns` workers en boucle jusqu'à l'échéance. */
async function runStage(opts: Options, conns: number): Promise<StageResult> {
  const deadline = performance.now() + opts.durationSeconds * 1000;
  const latencies: number[] = [];
  const byClass: Record<string, number> = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0, err: 0 };

  const worker = async (): Promise<void> => {
    while (performance.now() < deadline) {
      const start = performance.now();
      try {
        const res = await fetch(opts.url, {
          method: opts.method,
          headers: opts.headers,
          body: opts.body,
        });
        // Drainer le corps pour libérer la connexion (keep-alive).
        await res.arrayBuffer();
        latencies.push(performance.now() - start);
        byClass[statusClass(res.status)] += 1;
      } catch {
        latencies.push(performance.now() - start);
        byClass.err += 1;
      }
    }
  };

  await Promise.all(Array.from({ length: conns }, () => worker()));

  const total = Object.values(byClass).reduce((a, b) => a + b, 0);
  return {
    conns,
    durationSeconds: opts.durationSeconds,
    total,
    byClass,
    latency: summarizeLatencies(latencies),
  };
}

function ms(value: number): string {
  return `${value.toFixed(0)} ms`;
}

function printTable(results: StageResult[]): void {
  const header = ['Conns', 'Durée', 'req/s', 'p50', 'p95', 'p99', 'max', '2xx', 'non-2xx', 'err'];
  const rows = results.map((r) => {
    const non2xx = r.byClass['3xx'] + r.byClass['4xx'] + r.byClass['5xx'];
    return [
      String(r.conns),
      `${r.durationSeconds}s`,
      (r.total / r.durationSeconds).toFixed(0),
      ms(r.latency.p50),
      ms(r.latency.p95),
      ms(r.latency.p99),
      ms(r.latency.max),
      String(r.byClass['2xx']),
      String(non2xx),
      String(r.byClass.err),
    ];
  });
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((row) => row[i].length)));
  const line = (cells: string[]): string => cells.map((c, i) => c.padStart(widths[i])).join('  ');
  console.log(line(header));
  for (const row of rows) console.log(line(row));
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  console.log(`Charge : ${opts.method} ${opts.url}`);
  console.log(`Paliers : ${opts.stages.join(', ')} connexions × ${opts.durationSeconds}s\n`);

  const results: StageResult[] = [];
  for (const conns of opts.stages) {
    results.push(await runStage(opts, conns));
  }
  printTable(results);

  // Verdict SLO côté client : pire palier (p95 le plus haut, erreur cumulée).
  const worstP95Ms = Math.max(...results.map((r) => r.latency.p95));
  const totalReq = results.reduce((a, r) => a + r.total, 0);
  const totalServerErr = results.reduce((a, r) => a + r.byClass['5xx'] + r.byClass.err, 0);
  const clientErrorRate = totalReq > 0 ? totalServerErr / totalReq : 0;
  const verdict = evaluateSlo(
    { p95Seconds: worstP95Ms / 1000, errorRate: clientErrorRate },
    DEFAULT_SLO,
  );

  console.log(
    `\nClient — pire p95 : ${ms(worstP95Ms)} (SLO < 1000 ms) · ` +
      `erreurs (5xx+réseau) : ${(clientErrorRate * 100).toFixed(2)} % (SLO < 5 %)`,
  );

  // Croisé serveur optionnel : ce que /metrics (TLX-76) a réellement enregistré.
  if (opts.metricsUrl) {
    try {
      const res = await fetch(opts.metricsUrl);
      if (res.ok) {
        const summary = summarizeMetrics(await res.text());
        console.log(
          `Serveur /metrics — p95 GET : ${summary.p95Seconds === null ? 'n/a' : `${summary.p95Seconds.toFixed(3)} s`} · ` +
            `taux 5xx : ${summary.errorRate === null ? 'n/a' : `${(summary.errorRate * 100).toFixed(2)} %`} ` +
            `(sur ${summary.totalRequests} req)`,
        );
      }
    } catch (err) {
      console.warn(`(croisé /metrics indisponible : ${err instanceof Error ? err.message : err})`);
    }
  }

  if (verdict.ok) {
    console.log('✅ SLO client respecté.');
    process.exit(0);
  }
  console.error('❌ SLO client dépassé :');
  for (const breach of verdict.breaches) console.error(`   - ${breach}`);
  process.exit(1);
}

main().catch((err) => {
  console.error(`load-test: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(2);
});
