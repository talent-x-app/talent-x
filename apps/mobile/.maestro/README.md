# Tests E2E mobile (Maestro) — onboarding TLX-81

Parcours d'onboarding (login O-02, inscription O-03/O-04, consentement O-05) joués
sur **app réelle** (simulateur/appareil) contre l'**API live**. Complète la
validation web (déjà réalisée dans TLX-81) en couvrant le **trousseau natif**
(`expo-secure-store`, non exercé en web) et le rendu natif.

## Flows

| Fichier                           | Parcours                                                 |
| --------------------------------- | -------------------------------------------------------- |
| `01-register-consent-tabs.yaml`   | Inscription → consentement → tabs (e2e nominal, athlète) |
| `02-login.yaml`                   | Connexion : 401 (mauvais mdp) puis 200 → tabs            |
| `03-register-existing-email.yaml` | Inscription e-mail déjà pris → 409 inline                |

## Prérequis

1. **API + base + worker** (Docker) :
   ```bash
   docker compose up -d                 # postgres, redis, minio
   pnpm --filter @talent-x/api exec prisma migrate deploy
   pnpm --filter @talent-x/api seed
   pnpm --filter @talent-x/api start    # API sur :3000
   pnpm --filter @talent-x/api worker   # worker (exports/purges)
   ```
2. **URL API joignable depuis l'app** — `apps/mobile/.env`, `EXPO_PUBLIC_API_URL` :
   - Simulateur **iOS** : `http://localhost:3000/api/v1`
   - Émulateur **Android** : `http://10.0.2.2:3000/api/v1`
   - **Appareil physique** : `http://<IP-LAN-de-la-machine>:3000/api/v1`
     > L'API active déjà le CORS (utile pour la cible web ; sans effet sur le natif).
3. **App lancée** sur le simulateur (dev build ou Expo Go) :
   ```bash
   pnpm --filter @talent-x/mobile ios      # ou android
   ```
4. **Maestro** installé : https://maestro.mobile.dev (`curl -Ls "https://get.maestro.mobile.dev" | bash`).

## Lancer les flows

`APP_ID` = identifiant de l'app installée (Expo Go iOS : `host.exp.Exponent` ;
Expo Go Android : `host.exp.exponent` ; dev build : ton bundle id / package).

```bash
cd apps/mobile

# 1) e2e inscription → consentement → tabs (e-mail unique généré)
maestro test --env APP_ID=<app-id> .maestro/01-register-consent-tabs.yaml

# 2) connexion (compte connu — créé via le flow 01 ou l'API)
maestro test \
  --env APP_ID=<app-id> \
  --env LOGIN_EMAIL=<email> \
  --env LOGIN_PASSWORD=<mot-de-passe> \
  .maestro/02-login.yaml

# 3) inscription e-mail déjà utilisé → 409
maestro test \
  --env APP_ID=<app-id> \
  --env EXISTING_EMAIL=<email-déjà-pris> \
  .maestro/03-register-existing-email.yaml
```

## Notes

- Les écrans exposent des `testID` (`login-*`, `register-*`, `consent-*`) ciblés par
  les flows — rendus fiables, indépendants du texte.
- Réinitialiser la base (`seed`) entre deux campagnes pour repartir d'un état connu
  (le flow 01 génère un e-mail aléatoire et ne nécessite pas de reset).
- Automatisation CI : possible une fois un runner avec émulateur disponible
  (Maestro Cloud ou self-hosted) — hors périmètre du MVP local.
