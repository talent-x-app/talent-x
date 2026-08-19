/**
 * Serveur statique minimal du site public — développement local et tests E2E.
 *
 * Sans dépendance : le site est volontairement sans build ni paquet npm, et ce script
 * doit rester au même régime. Il reproduit les deux comportements que Nginx assure en
 * staging/production, sans quoi les tests locaux ne prouveraient rien du réel :
 *   1. les URL sans extension (`/reset-password` → `reset-password.html`) ;
 *   2. `/assets/config.js` synthétisé depuis l'environnement (l'URL de l'API n'est jamais
 *      en dur dans un fichier versionné).
 *
 * Usage :  pnpm --filter @talent-x/site dev
 *   SITE_PORT          port d'écoute            (défaut 4173)
 *   SITE_API_BASE_URL  base REST de l'API       (défaut http://localhost:3000/api/v1)
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const PUBLIC_DIR = resolve(import.meta.dirname, '..', 'public');
const PORT = Number(process.env.SITE_PORT ?? 4173);
const API_BASE_URL = process.env.SITE_API_BASE_URL ?? 'http://localhost:3000/api/v1';

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
};

/** Même contrat que le `location = /assets/config.js` du bloc Nginx. */
function configScript() {
  return `window.TALENTX_CONFIG={apiBaseUrl:${JSON.stringify(API_BASE_URL)}};\n`;
}

/** Candidats de résolution, dans l'ordre — aligné sur `try_files $uri $uri.html`. */
function candidatesFor(pathname) {
  const clean = pathname === '/' ? '/index' : pathname.replace(/\/+$/, '');
  return extname(clean) ? [clean] : [clean, `${clean}.html`];
}

const server = createServer((req, res) => {
  void (async () => {
    const { pathname } = new URL(req.url, `http://localhost:${PORT}`);

    if (pathname === '/assets/config.js') {
      res.writeHead(200, { 'Content-Type': CONTENT_TYPES['.js'] });
      res.end(configScript());
      return;
    }

    for (const candidate of candidatesFor(pathname)) {
      // `normalize` + préfixe vérifié : une requête `/../../etc/passwd` ne doit pas
      // sortir du dossier public.
      const filePath = join(PUBLIC_DIR, normalize(candidate));
      if (!filePath.startsWith(PUBLIC_DIR)) break;
      try {
        const body = await readFile(filePath);
        res.writeHead(200, {
          'Content-Type': CONTENT_TYPES[extname(filePath)] ?? 'application/octet-stream',
          'Referrer-Policy': 'no-referrer',
        });
        res.end(body);
        return;
      } catch {
        // Candidat suivant.
      }
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404');
  })();
});

server.listen(PORT, () => {
  process.stdout.write(`Site public servi sur http://localhost:${PORT} (API : ${API_BASE_URL})\n`);
});
