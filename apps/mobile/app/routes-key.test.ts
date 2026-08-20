import { readdirSync, readFileSync } from 'fs';
import { join, relative } from 'path';

/**
 * ADR-58 — toute route **paramétrée** doit remonter son écran via une `key` dérivée du
 * paramètre.
 *
 * Les écrans déclarés `Tabs.Screen … options={{ href: null }}` ne sont jamais démontés :
 * `useState` n'est évalué qu'une fois et changer de paramètre ne remonte rien, donc l'état
 * d'une ressource fuit vers la suivante. C'est la famille TLX-236 / TLX-239 / TLX-245, dont
 * la dernière armait une **suppression** sur la mauvaise séance.
 *
 * Ce test existe parce que la règle est une convention : rien dans le typage ni dans le
 * rendu ne l'impose, et un fichier de route ajouté demain l'oublierait en silence. Il
 * découvre les routes sur le disque plutôt que de les énumérer — une route future est donc
 * couverte sans que personne ait à penser à ce fichier.
 */

const APP_DIR = __dirname;

/** Chemins de toutes les routes paramétrées (`[param]` dans le nom de fichier ou d'un dossier). */
function parametrisedRoutes(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      parametrisedRoutes(full, acc);
    } else if (entry.name.endsWith('.tsx') && !entry.name.endsWith('.test.tsx')) {
      // Paramétrée si le fichier lui-même, ou l'un de ses dossiers parents, porte `[param]`.
      if (/\[[^\]]+\]/.test(relative(APP_DIR, full))) acc.push(full);
    }
  }
  return acc;
}

describe('routes paramétrées — remontage par `key` (ADR-58)', () => {
  const routes = parametrisedRoutes(APP_DIR);

  it('l’inventaire trouve bien les routes paramétrées', () => {
    // Garde-fou : si la découverte casse, les assertions ci-dessous passeraient à vide.
    expect(routes.length).toBeGreaterThanOrEqual(13);
  });

  it.each(routes.map((r) => [relative(APP_DIR, r), r]))(
    '%s remonte son écran via une `key`',
    (_label, file) => {
      const source = readFileSync(file, 'utf8');
      // Exemption prévue par l'ADR : une route peut conserver son instance si un état doit
      // réellement survivre au changement de ressource — à condition de le dire ici.
      if (source.includes('ADR-58 exemption:')) return;
      expect(source).toMatch(/\bkey=\{/);
      // La clé doit dériver d'un paramètre de route, pas d'une constante.
      expect(source).toMatch(/useLocalSearchParams/);
    },
  );
});
