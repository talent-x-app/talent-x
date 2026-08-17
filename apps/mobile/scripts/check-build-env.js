/**
 * Garde-fou de configuration des builds autonomes (suite TLX-84 / TLX-77).
 *
 * Un build `preview` ou `production` **fige** `EXPO_PUBLIC_API_URL` dans le bundle : l'erreur ne
 * se voit alors que chez l'utilisateur, une fois l'artefact distribué. Ce script la fait remonter
 * là où elle coûte le moins — à la construction.
 *
 * Les trois règles viennent de pannes réellement rencontrées, pas d'une liste théorique :
 *
 *  1. **URL absente** — après le nettoyage des variables EAS, plus rien ne fournit d'URL : l'app
 *     partirait avec `apiBaseUrl = ''` et échouerait sur chaque appel. `env.ts` n'avertit que sous
 *     `__DEV__`, donc jamais dans un build de production.
 *  2. **Préfixe `/api/v1` manquant** — les variables EAS pointaient
 *     `https://backend-talent-x.onrender.com/api`, un backend d'une itération antérieure **encore
 *     en ligne**. L'app démarrait normalement et renvoyait 404 sur tout. Une URL périmée mais
 *     vivante coûte bien plus cher qu'une URL absente.
 *  3. **HTTP en clair en production** — le contournement ATS/cleartext utilisé pour tester contre
 *     une API LAN n'a rien à faire dans un artefact de store.
 *
 * `development` est **exempté** par conception : un dev client ne bundle pas le JS de l'app, il le
 * charge depuis Metro, qui lit le `.env` local. Y exiger la variable serait un faux positif.
 */

/** Profils qui figent la configuration dans le bundle. `development` en est exclu (cf. en-tête). */
const BUNDLED_PROFILES = new Set(['preview', 'production']);

/** Préfixe imposé par le contrat (`docs/talent-x-openapi.yaml`). */
const REQUIRED_PATH_SUFFIX = '/api/v1';

/**
 * @param {{ profile?: string, apiUrl?: string }} input
 * @returns {{ ok: true, skipped?: boolean, reason?: string } | { ok: false, message: string }}
 */
function checkBuildEnv({ profile, apiUrl }) {
  if (!profile || !BUNDLED_PROFILES.has(profile)) {
    // Hors build EAS (hook lancé en local) ou profil `development` : rien à vérifier.
    return {
      ok: true,
      skipped: true,
      reason: `profil « ${profile ?? 'non défini'} » non concerné`,
    };
  }

  const url = (apiUrl ?? '').trim();
  if (!url) {
    return {
      ok: false,
      message:
        `EXPO_PUBLIC_API_URL est vide pour le profil « ${profile} ».\n` +
        "  Un build autonome fige cette valeur : sans elle, l'app démarre puis échoue sur chaque appel.\n" +
        '  La définir soit dans eas.json (build.' +
        profile +
        '.env), soit en variable EAS de cet environnement.',
    };
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, message: `EXPO_PUBLIC_API_URL n'est pas une URL valide : « ${url} ».` };
  }

  const path = parsed.pathname.replace(/\/+$/, '');
  if (!path.endsWith(REQUIRED_PATH_SUFFIX)) {
    return {
      ok: false,
      message:
        `EXPO_PUBLIC_API_URL ne se termine pas par « ${REQUIRED_PATH_SUFFIX} » : « ${url} ».\n` +
        "  C'est le préfixe du contrat. Une URL sans lui vise un backend d'une autre génération :\n" +
        "  l'app démarre normalement et renvoie 404 sur tout — panne bien plus coûteuse à diagnostiquer.",
    };
  }

  if (profile === 'production' && parsed.protocol !== 'https:') {
    return {
      ok: false,
      message:
        `EXPO_PUBLIC_API_URL est en « ${parsed.protocol} » pour un build de production : « ${url} ».\n` +
        "  Le HTTP en clair sert à tester contre une API LAN ; il n'a pas sa place dans un artefact de store.",
    };
  }

  return { ok: true };
}

module.exports = { checkBuildEnv, BUNDLED_PROFILES, REQUIRED_PATH_SUFFIX };

// Exécution directe : c'est ce que lance `eas-build-post-install`.
if (require.main === module) {
  const result = checkBuildEnv({
    profile: process.env.EAS_BUILD_PROFILE,
    apiUrl: process.env.EXPO_PUBLIC_API_URL,
  });

  if (result.ok) {
    console.log(
      result.skipped
        ? `[check-build-env] ignoré — ${result.reason}.`
        : '[check-build-env] configuration du build valide.',
    );
    process.exit(0);
  }

  console.error(`[check-build-env] ÉCHEC — ${result.message}`);
  process.exit(1);
}
