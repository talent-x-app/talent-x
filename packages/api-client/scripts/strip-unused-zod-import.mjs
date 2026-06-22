// Post-génération orval : retire l'import `zod` mort du client généré.
//
// orval 8.x émet `import { z as zod } from 'zod';` en tête du client `fetch` dès qu'un
// paramètre de chemin porte une contrainte (enum), alors qu'aucun `zod.` n'est jamais
// utilisé dans le fichier. Le client `fetch` est conçu SANS dépendance runtime (cf.
// orval.config.ts) ; cet import mort casserait `tsc` (module `zod` absent). On le supprime
// ici pour garder la génération reproductible et le client zéro-dépendance.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(here, '../src/generated/talent-x.ts');

const source = readFileSync(target, 'utf8');
// Retire tout import (multi-ligne) provenant du module 'zod', ainsi qu'une ligne vide résiduelle.
const cleaned = source.replace(/import\s*\{[^}]*\}\s*from\s*'zod';\n+/g, '');

if (cleaned !== source) {
  writeFileSync(target, cleaned);
  console.log('[postgenerate] import `zod` mort retiré de talent-x.ts');
}
