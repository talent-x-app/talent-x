# Keystore RS256 — signature des access tokens (TLX-020)

Référence : ADR-04 (JWT RS256 + refresh rotatif), TX-SEC-003 §11–12.

Ce module fournit les clés de **signature** et de **vérification** des access tokens
JWT (algorithme **RS256**) au reste de l'API via `KeyService`. Il ne signe pas
lui-même les jetons : l'émission (login) et la vérification (guard) relèvent des
tickets TLX-022 / TLX-024, qui consomment `KeyService`.

## Principe

- **Une seule clé privée vivante** à la fois (la clé _active_ de signature). C'est
  le seul secret réellement sensible.
- **Plusieurs clés publiques** peuvent être acceptées en vérification : la clé
  active + d'anciennes clés _retirées_, le temps qu'expirent les jetons qu'elles
  ont signés (rotation par **chevauchement**).
- Chaque clé est identifiée par un **`kid`** placé dans l'en-tête du JWT, ce qui
  permet de retrouver la bonne clé publique à la vérification.

## Variables d'environnement

| Variable                     | Rôle                                                                    | Requis                                              |
| ---------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------- |
| `JWT_PRIVATE_KEY`            | Clé privée PEM (PKCS#8) active. `\n` échappés acceptés.                 | **staging / prod** (dev/test : éphémère si absente) |
| `JWT_KEY_ID`                 | `kid` de la clé active. Si absent → thumbprint RFC 7638.                | non                                                 |
| `JWT_ADDITIONAL_PUBLIC_KEYS` | JSON `[{ kid, publicKey }]` : clés publiques retirées encore acceptées. | non                                                 |

En **dev/test**, si `JWT_PRIVATE_KEY` est absente, une clé éphémère est générée au
démarrage (un avertissement est journalisé) : pratique en local, mais les jetons
sont invalidés à chaque redémarrage. En **staging/production**, l'absence de clé
fait **échouer le démarrage** (fail-fast, cf. `env.validation.ts`).

## Générer une clé

```bash
pnpm --filter @talent-x/api keys:generate
```

Affiche la clé privée, la clé publique, le `kid`, et un extrait `.env` prêt à
coller. **Rien n'est écrit sur disque** : la clé privée est un secret à injecter
via le gestionnaire de secrets d'environnement (jamais commitée).

## Rotation (par chevauchement, sans invalider les sessions)

1. Générer une nouvelle paire (`keys:generate`).
2. Reporter l'**ancienne clé publique** dans `JWT_ADDITIONAL_PUBLIC_KEYS`
   (avec son `kid`) — les jetons déjà émis restent vérifiables.
3. Remplacer `JWT_PRIVATE_KEY` (et `JWT_KEY_ID` si fixé) par la **nouvelle** clé.
4. Redéployer : les nouveaux jetons sont signés par la nouvelle clé ; les anciens
   restent acceptés jusqu'à expiration.
5. Une fois la durée de vie des access tokens écoulée, retirer l'ancienne clé de
   `JWT_ADDITIONAL_PUBLIC_KEYS`.

## API (`KeyService`)

- `getSigningKey()` → `{ kid, privateKey, publicKey }` (clé active).
- `getActiveKid()` → `kid` à placer dans l'en-tête JWT émis.
- `getVerificationKey(kid)` → clé publique pour ce `kid`, ou `undefined`.
- `listVerificationKids()` → tous les `kid` acceptés.
- `algorithm` → `'RS256'`.
