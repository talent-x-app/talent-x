/**
 * Rastérise les assets de marque `design/assets/*.svg` vers `apps/mobile/assets/*.png`.
 *
 * Pourquoi un script plutôt que des PNG committés à la main : Expo ne consomme pas de SVG
 * pour `icon` / `adaptiveIcon` / `splash` / `favicon` — ces emplacements sont figés au build
 * par l'OS. Les SVG de `design/assets/` restent donc la **source unique** ; ce script en
 * dérive les bitmaps, et se rejoue quand la marque bouge.
 *
 * Rastériseur : Chromium via `playwright-core`, déjà présent (suite E2E). Pas de `sharp` ni
 * de `@resvg/resvg-js` à ajouter, et le moteur de rendu est celui qui sert déjà aux captures.
 *
 * Usage : `node scripts/generate-brand-assets.mjs`
 */
import { chromium } from 'playwright-core';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const brandDir = join(repoRoot, 'design', 'assets');
const outDir = join(repoRoot, 'apps', 'mobile', 'assets');

/* ---------- Extraction depuis la source de vérité ---------- */

/**
 * `app-icon.svg` porte le dégradé signature ; `monogram-white.svg` porte les tracés.
 * On les lit au lieu de les recopier : une retouche de la marque se propage sans édition ici.
 */
async function readBrandPrimitives() {
  const appIcon = await readFile(join(brandDir, 'app-icon.svg'), 'utf8');
  const monogram = await readFile(join(brandDir, 'monogram-white.svg'), 'utf8');

  const gradient = appIcon.match(/<linearGradient[\s\S]*?<\/linearGradient>/)?.[0];
  if (!gradient) throw new Error('app-icon.svg : <linearGradient> introuvable');

  // `id` réécrit par document généré : deux <defs> partageant un id se marcheraient dessus.
  const gradientStops = gradient.replace(/id="[^"]*"/, 'id="brand"');

  const paths = [...monogram.matchAll(/<path\b[^>]*\/?>(?:<\/path>)?/g)].map((m) => m[0]);
  if (paths.length === 0) throw new Error('monogram-white.svg : aucun <path>');

  const viewBox = monogram.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  if (!viewBox) throw new Error('monogram-white.svg : viewBox introuvable');

  const corner = appIcon.match(/<rect[^>]*\brx="([\d.]+)"/);
  const canvas = appIcon.match(/viewBox="0 0 ([\d.]+) /);
  if (!corner || !canvas) throw new Error('app-icon.svg : rect/rx ou viewBox introuvable');

  return {
    gradientStops,
    monogramPaths: paths.join(''),
    monogramWidth: Number(viewBox[1]),
    monogramHeight: Number(viewBox[2]),
    // Rayon relatif de la pastille (115/512) — conservé pour le splash et le favicon.
    cornerRatio: Number(corner[1]) / Number(canvas[1]),
  };
}

/* ---------- Composition ---------- */

const B = await readBrandPrimitives();

/** Monogramme centré, mis à l'échelle sur une fraction de la largeur du canevas. */
function monogram({ size, widthRatio, fill }) {
  const width = size * widthRatio;
  const scale = width / B.monogramWidth;
  const x = (size - width) / 2;
  const y = (size - B.monogramHeight * scale) / 2;
  const paths = fill ? B.monogramPaths.replace(/fill="[^"]*"/g, `fill="${fill}"`) : B.monogramPaths;
  return `<g transform="translate(${x.toFixed(2)},${y.toFixed(2)}) scale(${scale.toFixed(5)})">${paths}</g>`;
}

function svg({ size, body, defs = '' }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${
    defs ? `<defs>${defs}</defs>` : ''
  }${body}</svg>`;
}

/**
 * Proportion du monogramme dans l'icône, telle que la définit `app-icon.svg`
 * (transform `scale(1.6473)` sur un canevas 512 → 230 × 1.6473 / 512).
 */
const ICON_MONOGRAM_RATIO = 0.74;

/**
 * Zone sûre de l'adaptive icon Android. Android ne garantit visible qu'un **cercle centré de
 * 66dp sur les 108dp** du canevas, soit 61,1 % — le reste est rogné selon le masque du launcher.
 * Le monogramme est un bloc **2:1** : inscrit dans ce cercle, sa largeur maximale vaut
 * d / √(1² + 0,5²) = 0,611 / 1,118 = **0,547** du canevas.
 * D'où un monogramme visiblement plus petit que sur l'icône iOS : c'est la contrainte du masque,
 * pas un réglage à « corriger » en l'agrandissant — les pointes du X seraient rognées.
 */
const ADAPTIVE_MONOGRAM_RATIO = 0.547;

const ICON_SIZE = 1024;
const FAVICON_SIZE = 64;
const INK = '#0B0F17'; // = palette.slate[950] = fond du thème sombre (app-icon-ink.svg)

const documents = {
  /**
   * Icône iOS + icône Android legacy. **Plein cadre, sans coins arrondis** : les deux OS
   * appliquent leur propre masque. Rastériser la pastille arrondie ici produirait des coins
   * transparents → bordures noires sur iOS (et un rejet App Store, qui refuse l'alpha).
   */
  'icon.png': {
    size: ICON_SIZE,
    doc: svg({
      size: ICON_SIZE,
      defs: B.gradientStops,
      body:
        `<rect width="${ICON_SIZE}" height="${ICON_SIZE}" fill="url(#brand)"/>` +
        monogram({ size: ICON_SIZE, widthRatio: ICON_MONOGRAM_RATIO }),
    }),
    opaque: true,
  },

  /** Variante sombre iOS (`ios.icon.dark`) — reprend l'encre d'`app-icon-ink.svg`. */
  'icon-dark.png': {
    size: ICON_SIZE,
    doc: svg({
      size: ICON_SIZE,
      body:
        `<rect width="${ICON_SIZE}" height="${ICON_SIZE}" fill="${INK}"/>` +
        monogram({ size: ICON_SIZE, widthRatio: ICON_MONOGRAM_RATIO }),
    }),
    opaque: true,
  },

  /** Foreground Android : monogramme seul sur fond transparent, dans la zone sûre. */
  'adaptive-icon-foreground.png': {
    size: ICON_SIZE,
    doc: svg({
      size: ICON_SIZE,
      body: monogram({ size: ICON_SIZE, widthRatio: ADAPTIVE_MONOGRAM_RATIO }),
    }),
  },

  /**
   * Background Android : le dégradé seul. `adaptiveIcon.backgroundColor` ne prend qu'un aplat —
   * un `backgroundImage` est le seul moyen de garder le dégradé signature sous le masque.
   */
  'adaptive-icon-background.png': {
    size: ICON_SIZE,
    doc: svg({
      size: ICON_SIZE,
      defs: B.gradientStops,
      body: `<rect width="${ICON_SIZE}" height="${ICON_SIZE}" fill="url(#brand)"/>`,
    }),
    opaque: true,
  },

  /**
   * Splash : ici la pastille **arrondie** est voulue — elle flotte sur le fond du thème,
   * donc les coins transparents sont corrects, et le même visuel tient sur clair et sombre.
   */
  'splash-icon.png': {
    size: ICON_SIZE,
    doc: svg({
      size: ICON_SIZE,
      defs: B.gradientStops,
      body:
        `<rect width="${ICON_SIZE}" height="${ICON_SIZE}" rx="${(ICON_SIZE * B.cornerRatio).toFixed(2)}" fill="url(#brand)"/>` +
        monogram({ size: ICON_SIZE, widthRatio: ICON_MONOGRAM_RATIO }),
    }),
  },

  /** Favicon web : pastille arrondie, à l'image de `favicon.svg`. */
  'favicon.png': {
    size: FAVICON_SIZE,
    doc: svg({
      size: FAVICON_SIZE,
      defs: B.gradientStops,
      body:
        `<rect width="${FAVICON_SIZE}" height="${FAVICON_SIZE}" rx="${(FAVICON_SIZE * B.cornerRatio).toFixed(2)}" fill="url(#brand)"/>` +
        monogram({ size: FAVICON_SIZE, widthRatio: ICON_MONOGRAM_RATIO }),
    }),
  },
};

/* ---------- Rastérisation ---------- */

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  for (const [name, { size, doc, opaque }] of Object.entries(documents)) {
    await page.setViewportSize({ width: size, height: size });
    // `margin:0` + SVG en bloc : sinon la marge par défaut du body décale la capture.
    await page.setContent(
      `<!doctype html><style>*{margin:0;padding:0}svg{display:block}</style>${doc}`,
      { waitUntil: 'load' },
    );
    const png = await page.screenshot({ omitBackground: !opaque, type: 'png' });
    await writeFile(join(outDir, name), png);
    console.log(`✓ ${name.padEnd(30)} ${size}×${size}${opaque ? ' (opaque)' : ' (alpha)'}`);
  }
} finally {
  await browser.close();
}
console.log(`\n${Object.keys(documents).length} assets écrits dans apps/mobile/assets/`);

/* ---------- Garde anti-dérive des couleurs du splash ---------- */

/**
 * `app.json` est du JSON statique : il ne peut pas importer `@talent-x/design-tokens`, donc les
 * fonds du splash y sont écrits en dur — seule entorse à la règle « jamais de valeur en dur »
 * (CLAUDE.md). On la rend **vérifiable** plutôt que silencieuse : ces deux hex doivent rester
 * égaux aux fonds de thème. Si le design system bouge, ce script échoue au lieu de laisser
 * l'app démarrer sur un splash désaccordé.
 *
 * L'alternative — migrer `app.json` vers `app.config.ts` pour importer les tokens — n'est pas
 * prise ici : la config a été alignée à la main sur ce que le build EAS produit (commit 7034aef,
 * après l'épisode des `app.json` parasites), et la restructurer ne relève pas de ce lot.
 */
const tokensSrc = await readFile(
  join(repoRoot, 'packages', 'design-tokens', 'src', 'tokens.ts'),
  'utf8',
);
const slate = (shade) => {
  const block = tokensSrc.match(/slate:\s*\{([\s\S]*?)\}/)?.[1];
  const hex = block?.match(new RegExp(`\\b${shade}:\\s*'(#[0-9A-Fa-f]{6})'`))?.[1];
  if (!hex) throw new Error(`tokens.ts : palette.slate[${shade}] introuvable`);
  return hex.toUpperCase();
};

const appJson = JSON.parse(await readFile(join(repoRoot, 'apps', 'mobile', 'app.json'), 'utf8'));
const splashProps = appJson.expo.plugins.find(
  (p) => Array.isArray(p) && p[0] === 'expo-splash-screen',
)?.[1];
if (!splashProps) throw new Error("app.json : plugin 'expo-splash-screen' absent");

const expected = [
  ['splash clair', splashProps.backgroundColor, slate(50)], // = lightTheme.colors.background
  ['splash sombre', splashProps.dark?.backgroundColor, slate(950)], // = darkTheme.colors.background
];
const drift = expected.filter(([, actual, want]) => actual?.toUpperCase() !== want);
if (drift.length > 0) {
  for (const [label, actual, want] of drift) {
    console.error(`✗ ${label} : app.json=${actual} ≠ tokens=${want}`);
  }
  throw new Error('app.json désaccordé du design system — aligner les fonds du splash.');
}
console.log('✓ fonds du splash alignés sur palette.slate[50] / [950]');
