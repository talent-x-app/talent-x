/**
 * Génère une paire de clés RS256 pour la signature des access tokens (TLX-020).
 *
 * Usage : `pnpm --filter @talent-x/api keys:generate`
 *
 * N'écrit aucun fichier (les clés sont des secrets) : imprime la clé privée, la
 * clé publique, le `kid` dérivé, et un extrait `.env` prêt à coller (clé privée
 * sur une ligne, sauts de ligne échappés en `\n`). En staging/production, la clé
 * privée doit être injectée comme secret d'environnement, jamais commitée.
 *
 * Rotation : générer une nouvelle paire, placer la nouvelle clé privée dans
 * JWT_PRIVATE_KEY, et reporter l'ANCIENNE clé PUBLIQUE dans
 * JWT_ADDITIONAL_PUBLIC_KEYS le temps que les jetons précédents expirent.
 */
import { generateKeyPairPem, thumbprintKid } from '../src/auth/keys/jwt-keys.config';
import { createPublicKey } from 'node:crypto';

function escapeForEnv(pem: string): string {
  return pem.trim().replace(/\n/g, '\\n');
}

function main(): void {
  const { privateKey, publicKey } = generateKeyPairPem();
  const kid = thumbprintKid(createPublicKey(publicKey));

  const out = process.stdout;
  out.write('\n=== Clé RS256 générée (TLX-020) ===\n');
  out.write(`\nkid (thumbprint RFC 7638) : ${kid}\n`);
  out.write('\n--- Clé privée (PEM, PKCS#8) — SECRET, ne jamais committer ---\n');
  out.write(`${privateKey.trim()}\n`);
  out.write(
    '\n--- Clé publique (PEM, SPKI) — pour JWT_ADDITIONAL_PUBLIC_KEYS lors d’une rotation ---\n',
  );
  out.write(`${publicKey.trim()}\n`);
  out.write('\n--- Extrait .env (clé privée mono-ligne, \\n échappés) ---\n');
  out.write(`JWT_KEY_ID="${kid}"\n`);
  out.write(`JWT_PRIVATE_KEY="${escapeForEnv(privateKey)}"\n`);
  out.write('\n');
}

main();
