---
name: playwright-e2e
description: >-
  Écrire, lancer et débugger des tests UI/E2E Playwright pour Talent-X, sur la cible
  Expo web (react-native-web). À utiliser dès que l'utilisateur parle de tests E2E,
  tests UI, tests bout-en-bout, Playwright, "tester le parcours", "tester l'écran dans
  un navigateur", scénario coach/athlète automatisé, ou veut vérifier un flux complet
  (login → action → résultat) de façon reproductible — même sans citer "Playwright"
  explicitement. NE PAS utiliser pour les tests unitaires/composants (Jest +
  @testing-library/react-native) ni pour piloter l'app native sur téléphone (adb/Detox).
---

# Playwright E2E — Talent-X

## Ce qu'il faut comprendre d'abord

Talent-X est une app **React Native / Expo**. Playwright pilote un **navigateur**, donc
il ne teste **que la cible Expo web** (`react-native-web`), pas le rendu natif iOS/Android.
Pour le natif, c'est Detox/adb — hors périmètre de ce skill. En pratique, le web couvre
la logique d'écran, la navigation expo-router, les appels API et les interactions ; c'est
suffisant pour la majorité des régressions UI.

**L'insight central : `testID` devient `data-testid`.** Le projet pose déjà des `testID`
partout (≈350 occurrences). `react-native-web` les rend en attribut DOM `data-testid`, que
Playwright cible nativement via `page.getByTestId(...)`. **Donc on ne crée pas de nouveaux
sélecteurs : on réutilise les `testID` existants.** S'il manque un `testID` sur un élément à
cibler, l'ajouter dans le composant (le `testID` sert aussi aux tests Jest) plutôt que de
viser par texte/classe, fragiles et sensibles à l'i18n.

## Périmètre & dépendances

Un test E2E réaliste a besoin de **trois choses** vivantes en local :

1. **API NestJS** sur `:3000` — lancée via `nest start` (pas `pnpm start` qui sert un
   `dist/` figé). La clé RS256 est **éphémère** : à chaque redémarrage de l'API, les vieux
   tokens sont invalides → re-seed + re-login. Voir `references/seed-via-api.md`.
2. **Postgres** — port hôte spécifique à la machine (souvent **5433**, pas 5432 ; voir
   `apps/api/.env`, gitignoré). `docker compose up -d`.
3. **Expo web** sur `:8081` — `pnpm --filter @talent-x/mobile exec expo start --web --port 8081`.
   Le **premier bundle Metro prend ~15-20 s** : prévoir des timeouts généreux.

Les comptes **seedés en base ne sont pas connectables** (hash placeholder). On crée donc le
scénario de test **via l'API REST** au démarrage (voir seed plus bas).

## Mise en place (one-time)

Si Playwright n'est pas encore installé dans `apps/mobile` :

```bash
pnpm --filter @talent-x/mobile add -D @playwright/test
pnpm --filter @talent-x/mobile exec playwright install chromium
```

Puis copier les fichiers fournis :

- `assets/playwright.config.ts` → `apps/mobile/playwright.config.ts`
- `assets/fixtures.ts` → `apps/mobile/e2e/fixtures.ts`

Et ajouter les scripts dans `apps/mobile/package.json` :

```json
"e2e": "playwright test",
"e2e:ui": "playwright test --ui",
"e2e:headed": "playwright test --headed"
```

Les specs vivent dans **`apps/mobile/e2e/*.spec.ts`**. La config jest existante ignore déjà
`e2e/` si besoin (vérifier `testPathIgnorePatterns` dans `jest.config.js`, sinon l'ajouter
pour que Jest ne ramasse pas les specs Playwright).

## Lancer la stack avant les tests

L'ordre compte (Postgres → API → web). Dans des terminaux séparés (ou en arrière-plan) :

```bash
# 1. base
docker compose up -d
# 2. API (depuis apps/api) — clé RS256 fraîche
pnpm exec nest start            # écoute sur :3000, contrat = docs/talent-x-openapi.yaml
# 3. web (la config Playwright peut le démarrer elle-même, cf. webServer)
```

La `webServer` de `playwright.config.ts` démarre Expo web automatiquement et réutilise un
serveur déjà lancé (`reuseExistingServer`). L'**API n'est pas** gérée par Playwright (elle
dépend de Docker + d'un état seedé) : la laisser tourner à part, et seeder via fixture.

## Écrire un test

**Stratégie de sélection, par ordre de préférence :**

1. `page.getByTestId('login-submit')` — réutiliser les `testID` du code. **Défaut.**
2. `page.getByRole('button', { name: ... })` — pour l'accessibilité, si le `testID` manque
   et qu'on ne veut pas en ajouter.
3. Jamais de sélecteur CSS de classe/structure (`.css-1ab2c3`) : `react-native-web` génère
   des classes hashées instables.

**Le parcours type** s'appuie sur les fixtures fournies (`e2e/fixtures.ts`) :

- `apiSeed` — crée un scénario complet via l'API REST (coach + groupe + athlète + séance),
  en **UTF-8 propre** via le `request` context de Playwright (évite la corruption d'accents
  du shell Git Bash sous Windows). Retourne les identifiants/credentials créés.
- `loginAs(page, creds)` — connecte un utilisateur via l'UI (`login-email`, `login-password`,
  `login-submit`) et attend l'écran d'accueil. La session web est persistée par
  expo-secure-store dans le `localStorage` → on peut aussi capturer un `storageState`.

Exemple minimal :

```ts
import { test, expect } from './fixtures';

test('le coach voit le brief de la séance', async ({ page, apiSeed }) => {
  const { coach, sessionId } = await apiSeed.basicScenario();
  await apiSeed.loginAs(page, coach);

  await page.getByTestId(`session-card-${sessionId}`).click();
  await expect(page.getByTestId('session-brief')).toBeVisible();
});
```

Pour les `testID` réels par écran (auth, builder de séance, dashboard, brief…), voir
`references/selectors.md`. Pour la séquence de seed détaillée et ses pièges (Idempotency-Key,
consentement RGPD, statut « en retard »), voir `references/seed-via-api.md`.

## Lancer & débugger

```bash
pnpm --filter @talent-x/mobile e2e            # headless, tous les specs
pnpm --filter @talent-x/mobile e2e:ui         # mode UI interactif (idéal pour itérer)
pnpm --filter @talent-x/mobile e2e:headed     # voir le navigateur
pnpm --filter @talent-x/mobile exec playwright test e2e/brief.spec.ts --debug
```

Au moindre échec, lire le **trace** (`playwright-report/`, ou `--trace on`) : il contient le
DOM, les captures et le réseau à chaque étape. Vérifier d'abord les suspects habituels :

- **Timeout au démarrage** → le premier bundle Metro n'était pas fini ; augmenter
  `webServer.timeout` et `expect` timeout.
- **401 / écran de login inattendu** → l'API a redémarré (clé RS256 neuve) et le token est
  périmé ; re-seeder. Ne jamais réutiliser un `storageState` d'une session API précédente.
- **Élément introuvable** → confirmer que le `testID` existe dans le composant et qu'il est
  bien monté (l'écran peut être en chargement TanStack Query → `await expect(...).toBeVisible()`
  plutôt qu'un `click` immédiat).
- **Accents cassés dans les données seedées** → seeder via le `request` context de Playwright
  (déjà UTF-8), pas via curl en Git Bash.

## Conventions projet à respecter

- **Pas de valeur en dur** : `baseURL`, URL d'API, credentials de test → via `.env` / variables
  d'environnement, jamais codés dans les specs (cf. CLAUDE.md).
- **Un ticket Linear** pour tout flux qu'on n'a pas réussi à tester en réel (Docker/base), per
  la convention du projet.
- Le **contrat API fait foi** : toute requête de seed se cale sur `docs/talent-x-openapi.yaml`.
- Commits : `test(TLX-xxx): ...` en Conventional Commits.
