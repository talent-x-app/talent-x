import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

/**
 * Hachage des mots de passe en Argon2id (TX-SEC-003 §auth). Argon2id est
 * l'algorithme par défaut de @node-rs/argon2 ; paramètres alignés OWASP. Aucun
 * secret en dur : le sel est généré par Argon2 et encodé dans le hash résultant.
 */
@Injectable()
export class PasswordService {
  private readonly options = {
    memoryCost: 19_456, // 19 MiB
    timeCost: 2,
    parallelism: 1,
  };

  hash(plain: string): Promise<string> {
    return hash(plain, this.options);
  }

  /** Vérifie un mot de passe contre son hash ; false si le hash est invalide. */
  async verify(hashed: string, plain: string): Promise<boolean> {
    try {
      return await verify(hashed, plain);
    } catch {
      return false;
    }
  }
}
