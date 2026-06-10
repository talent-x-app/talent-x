# Tests E2E mobile (Maestro) — onboarding TLX-81 + parcours critiques TLX-120

Parcours joués sur **app réelle** (simulateur/appareil) contre l'**API live** :
onboarding (login O-02, inscription O-03/O-04, consentement O-05) et **parcours
critiques** coach↔athlète (création de séance → assignation → saisie de perf).
Complète la validation web en couvrant le **trousseau natif** (`expo-secure-store`,
non exercé en web) et le rendu natif.

## Flows

| Fichier                           | Parcours                                                           |
| --------------------------------- | ------------------------------------------------------------------ |
| `01-register-consent-tabs.yaml`   | Inscription → consentement → tabs (e2e nominal, athlète)           |
| `02-login.yaml`                   | Connexion : 401 (mauvais mdp) puis 200 → tabs                      |
| `03-register-existing-email.yaml` | Inscription e-mail déjà pris → 409 inline                          |
| `04-coach-create-assign.yaml`     | Coach : séance typée (C-05) → assignation (C-06) → confirmation    |
| `05-athlete-perf.yaml`            | Athlète : séance à faire → saisie typée (A-04) → confirmation A-05 |

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

# 4) parcours critique coach : séance typée → assignation → confirmation (TLX-120)
#    Pré-requis : coach avec ≥ 1 athlète lié (groupe rejoint).
maestro test \
  --env APP_ID=<app-id> \
  --env COACH_EMAIL=<email-coach> \
  --env COACH_PASSWORD=<mot-de-passe> \
  --env ATHLETE_NAME='<Prénom Nom affiché>' \
  .maestro/04-coach-create-assign.yaml

# 5) parcours critique athlète : saisie de perf → confirmation (TLX-120)
#    Pré-requis : jouer le flow 04 d'abord (séance « Maestro — Vitesse 60m » assignée).
maestro test \
  --env APP_ID=<app-id> \
  --env ATHLETE_EMAIL=<email-athlète> \
  --env ATHLETE_PASSWORD=<mot-de-passe> \
  --env SESSION_TITLE='Maestro — Vitesse 60m' \
  .maestro/05-athlete-perf.yaml
```

> Le pendant **API** des parcours critiques est automatisé en CI :
> `apps/api/test/critical-paths.int-spec.ts` (suite `test:int`, DB-backed) joue le
> cycle complet coach↔athlète via HTTP — les flows Maestro valident la couche
> mobile native par-dessus.

## Notes

- Les écrans exposent des `testID` (`login-*`, `register-*`, `consent-*`) ciblés par
  les flows — rendus fiables, indépendants du texte.
- Réinitialiser la base (`seed`) entre deux campagnes pour repartir d'un état connu
  (le flow 01 génère un e-mail aléatoire et ne nécessite pas de reset).
- Automatisation CI : possible une fois un runner avec émulateur disponible
  (Maestro Cloud ou self-hosted) — hors périmètre du MVP local.
