/**
 * Configuration d'environnement de l'app mobile (TLX-009).
 * Aucune valeur en dur : l'URL de l'API vient de la variable publique Expo
 * `EXPO_PUBLIC_API_URL` (injectée au build, cf. doc Expo). C'est une URL
 * publique, pas un secret.
 */

/** URL de base de l'API, ex. `https://api.talent-x.example/api/v1`. */
export const apiBaseUrl = process.env.EXPO_PUBLIC_API_URL ?? '';

/**
 * Délai (en heures) avant l'échéance d'une séance jusqu'auquel l'athlète est invité à confirmer
 * sa présence (ADR-43 §1 : `attendanceDeadline` **dérivée** de `dueDate` − ce délai, jamais
 * stockée). Configurable via `EXPO_PUBLIC_ATTENDANCE_DEADLINE_HOURS` ; défaut 12 h.
 */
export const attendanceDeadlineHours = Number(
  process.env.EXPO_PUBLIC_ATTENDANCE_DEADLINE_HOURS ?? 12,
);

if (!apiBaseUrl && __DEV__) {
  // En dev, on alerte tôt sans bloquer (l'app peut tourner en mode vitrine).
  console.warn(
    "[config] EXPO_PUBLIC_API_URL n'est pas défini : les appels API échoueront. " +
      'Renseignez-le dans .env (cf. README).',
  );
}
