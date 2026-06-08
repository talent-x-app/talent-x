/**
 * Configuration d'environnement de l'app mobile (TLX-009).
 * Aucune valeur en dur : l'URL de l'API vient de la variable publique Expo
 * `EXPO_PUBLIC_API_URL` (injectée au build, cf. doc Expo). C'est une URL
 * publique, pas un secret.
 */

/** URL de base de l'API, ex. `https://api.talent-x.example/api/v1`. */
export const apiBaseUrl = process.env.EXPO_PUBLIC_API_URL ?? '';

if (!apiBaseUrl && __DEV__) {
  // En dev, on alerte tôt sans bloquer (l'app peut tourner en mode vitrine).
  console.warn(
    "[config] EXPO_PUBLIC_API_URL n'est pas défini : les appels API échoueront. " +
      'Renseignez-le dans .env (cf. README).',
  );
}
