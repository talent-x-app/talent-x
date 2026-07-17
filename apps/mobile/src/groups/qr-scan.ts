/**
 * Extraction du code d'invitation depuis un payload de QR scanné (TLX-188).
 *
 * Le QR coach (`CoachGroupDetailScreen`, composant `QrCode`) encode le code brut
 * (format serveur : 8 caractères `[A-Z2-9]`, ADR-16). On tolère aussi un éventuel
 * deep-link (`talentx://join?code=…` ou URL https) pour rester compatible avec
 * l'option deep-link du ticket — dans tous les cas, seul un code au format valide
 * est accepté (un QR étranger ne doit jamais partir vers `POST /groups/join`).
 */

/** Format serveur du code d'invitation (ADR-16) : 8 caractères, sans 0/1 ambigus. */
const INVITE_CODE_PATTERN = /^[A-Z2-9]{8}$/;

/** Extrait la valeur `code` d'un payload en forme d'URL/deep-link, sinon `null`. */
function codeParamOf(payload: string): string | null {
  const match = /[?&]code=([^&\s]+)/.exec(payload);
  if (match == null) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

/**
 * Retourne le code d'invitation normalisé (majuscules) porté par le payload,
 * ou `null` si le QR scanné n'est pas un QR d'invitation Talent-X.
 */
export function extractInviteCode(payload: string): string | null {
  const raw = payload.trim();
  if (raw === '') return null;
  const candidate = (codeParamOf(raw) ?? raw).trim().toUpperCase();
  return INVITE_CODE_PATTERN.test(candidate) ? candidate : null;
}
