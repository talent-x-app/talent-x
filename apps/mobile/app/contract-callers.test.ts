import { readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';

/**
 * TLX-256 — **chaque `operationId` du contrat a un appelant, ou une absence déclarée.**
 *
 * Quatre opérations ont été trouvées sans appelant pendant la campagne de qualification —
 * `archiveSession`, `unengageAthlete`, `duplicateSession` (hors modèles) et `deleteComment` —
 * toutes **une par une, par hasard**, parce qu'un utilisateur cherchait un bouton qui n'existait
 * pas. Chacune était pourtant implémentée, autorisée correctement, testée côté API et publiée
 * dans le client généré. Un coach pouvait engager ses athlètes sur une compétition et ne plus
 * jamais les retirer ; un athlète ne pouvait pas effacer son propre message.
 *
 * Le correctif durable n'est pas le quatrième bouton, c'est ce contrôle : la recherche manuelle
 * ne converge pas. Ce test l'a d'ailleurs prouvé en s'exécutant pour la première fois — il en a
 * relevé **neuf**, pas quatre.
 *
 * Même patron que `routes-key.test.ts` (ADR-58) : la liste est **découverte sur le disque**, pas
 * énumérée à la main, et le test se protège d'un inventaire vide qui le rendrait creux.
 */

const REPO_ROOT = resolve(__dirname, '../../..');
const CONTRACT = join(REPO_ROOT, 'docs/talent-x-openapi.yaml');

/** Racines des **clients** du contrat : l'app mobile et le site public (ADR-57). */
const CLIENT_ROOTS = [
  join(REPO_ROOT, 'apps/mobile/src'),
  join(REPO_ROOT, 'apps/mobile/app'),
  join(REPO_ROOT, 'apps/site/public'),
];

/**
 * Absences **déclarées**, avec leur raison. Une entrée ici est une décision, pas un oubli :
 * c'est la seule différence entre les deux, et c'est pourquoi la raison est obligatoire.
 *
 * Y ajouter une ligne doit coûter une justification ; sans quoi ce test deviendrait un
 * enregistreur d'oublis plutôt qu'un garde-fou.
 */
const DECLARED_ABSENCES: Record<string, string> = {
  health:
    'Sonde de disponibilité (déploiement, /ready) — consommée par l’infrastructure, jamais par un client.',
  resetPassword:
    'Consommée par `apps/site` en `fetch` direct sur le chemin brut : ADR-57 impose que la ' +
    'récupération fonctionne SANS l’app, donc sans le client généré. Le nom d’opération ' +
    'n’apparaît pas, l’appel existe (`public/assets/reset-password.js`).',
  enable2fa: 'Double authentification — hors périmètre MVP, aucun écran prévu à ce jour.',
  verify2fa:
    'Double authentification (vérification du code) — hors périmètre MVP, comme `enable2fa`.',
  logoutAll:
    'Déconnexion de toutes les sessions — implémentée côté API, pas encore exposée dans le ' +
    'Profil. Absence assumée, pas un oubli de câblage.',
  unassignSessionGroup:
    'Désassignation d’un groupe entier — le coach retire aujourd’hui les affectations une à ' +
    'une (`deleteAssignment`). L’opération de masse reste sans surface, à décider produit.',
};

/** `operationId` déclarés par le contrat — source de vérité (CLAUDE.md). */
function contractOperationIds(): string[] {
  const yaml = readFileSync(CONTRACT, 'utf8');
  const ids = [...yaml.matchAll(/^\s*operationId:\s*([A-Za-z0-9_]+)\s*$/gm)].map((m) => m[1]);
  return [...new Set(ids)].sort();
}

/**
 * Code source **de production** des clients, concaténé.
 *
 * Les fichiers de test sont **exclus**, et c'est le cœur du contrôle : un `jest.mock` nomme
 * l'opération sans l'appeler nulle part. Le premier jet les incluait — mesuré, le détecteur ne
 * tirait alors pas du tout : retirer `deleteComment` du composant laissait le test vert, parce
 * que le mock de `FeedbackThread.test.tsx` suffisait à le faire passer pour câblé. Un test qui
 * accepte un mock comme preuve d'appel ne prouve rien, ce qui est précisément le défaut que ce
 * fichier existe pour empêcher.
 *
 * Ce fichier-ci est exclu aussi : il cite chaque nom d'opération dans `DECLARED_ABSENCES` et se
 * lirait donc lui-même comme l'appelant qu'il cherche.
 */
function clientSources(): string {
  const chunks: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules') continue;
        walk(full);
      } else if (
        /\.(ts|tsx|js|mjs|html)$/.test(entry.name) &&
        !/\.(test|spec)\.[jt]sx?$/.test(entry.name) &&
        full !== __filename
      ) {
        chunks.push(stripComments(readFileSync(full, 'utf8')));
      }
    }
  };
  for (const root of CLIENT_ROOTS) walk(root);
  return chunks.join('\n');
}

/**
 * Retire commentaires de bloc, de ligne et HTML.
 *
 * Sans ça, une opération **citée en prose** — « `deleteComment` était implémentée… » dans le
 * commentaire qui explique le correctif — se ferait passer pour un appel. Mesuré : le détecteur
 * ne tirait pas tant que la mention subsistait. Un contrôle qui accepte un commentaire comme
 * preuve d'appel a exactement le défaut qu'il cherche à empêcher.
 *
 * Approximation assumée : cette découpe ignore les chaînes contenant `//`. Une opération n'est
 * jamais nommée dans une URL littérale ici (le client généré porte les chemins), et un faux
 * négatif ferait échouer le test bruyamment plutôt que passer en silence.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('opérations du contrat — chacune a un appelant (TLX-256)', () => {
  const operations = contractOperationIds();
  const sources = clientSources();

  it('l’inventaire trouve bien les opérations du contrat', () => {
    // Garde-fou : si la découverte casse, l'assertion ci-dessous passerait à vide.
    expect(operations.length).toBeGreaterThanOrEqual(80);
  });

  it('l’inventaire trouve bien les sources clientes', () => {
    expect(sources.length).toBeGreaterThan(100_000);
  });

  it('aucune opération publiée n’est sans appelant ni absence déclarée', () => {
    const orphans = operations.filter(
      (op) => !(op in DECLARED_ABSENCES) && !new RegExp(`\\b${op}\\b`).test(sources),
    );

    expect(orphans).toEqual([]);
  });

  it('aucune absence déclarée n’est devenue obsolète', () => {
    // Une opération câblée depuis doit sortir de la liste : sinon celle-ci se transforme
    // lentement en décor, et le contrôle perd son sens.
    const stale = Object.keys(DECLARED_ABSENCES).filter((op) =>
      new RegExp(`\\b${op}\\b`).test(sources),
    );

    expect(stale).toEqual([]);
  });

  it('toute absence déclarée porte une raison, et vise une opération réelle', () => {
    for (const [op, reason] of Object.entries(DECLARED_ABSENCES)) {
      expect(reason.length).toBeGreaterThan(30);
      expect(operations).toContain(op);
    }
  });
});
