import { randomInt } from 'node:crypto';

/**
 * Alphabet sans caractères ambigus (pas de 0/O/1/I/L) pour un code lisible et
 * dictable. Le code d'invitation est partagé hors-ligne (oral, message) : la
 * lisibilité prime, l'entropie reste élevée (28^8 ≈ 3,8e11).
 */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

/** Génère un code d'invitation aléatoire (CSPRNG). Unicité garantie côté appelant. */
export function generateInviteCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return code;
}
