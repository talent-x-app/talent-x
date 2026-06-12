/**
 * Paramètres d'authentification (TLX-021+). Valeurs non secrètes, surchargées
 * par l'environnement, avec des défauts sûrs. Les secrets (clés RS256) vivent
 * dans le keystore (TLX-020), jamais ici.
 */

function positiveInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/** Durée de vie de l'access token (court — ADR-04), en secondes. Défaut : 15 min. */
export const ACCESS_TOKEN_TTL_SECONDS = positiveInt(process.env.ACCESS_TOKEN_TTL_SECONDS, 15 * 60);

/** Durée de vie du refresh token, en secondes. Défaut : 30 jours. */
export const REFRESH_TOKEN_TTL_SECONDS = positiveInt(
  process.env.REFRESH_TOKEN_TTL_SECONDS,
  30 * 24 * 60 * 60,
);

/** Émetteur (claim `iss`) des access tokens. */
export const JWT_ISSUER = process.env.JWT_ISSUER ?? 'talent-x';

/**
 * Durée de vie d'un jeton de réinitialisation de mot de passe (TLX-104,
 * TX-SEC-003 §11 — « token expirant »), en secondes. Défaut : 1 heure.
 */
export const PASSWORD_RESET_TOKEN_TTL_SECONDS = positiveInt(
  process.env.PASSWORD_RESET_TOKEN_TTL_SECONDS,
  60 * 60,
);
