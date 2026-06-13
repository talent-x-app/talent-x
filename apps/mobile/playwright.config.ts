import { defineConfig, devices } from '@playwright/test';

/**
 * Config Playwright pour Talent-X (cible Expo web / react-native-web).
 *
 * Valeurs surchargeable par env (rien en dur — cf. CLAUDE.md) :
 *   E2E_BASE_URL   URL de l'app web servie par Expo   (défaut http://localhost:8081)
 *   E2E_API_URL    base REST de l'API NestJS          (défaut http://localhost:3000/api/v1)
 *
 * L'API n'est PAS gérée par `webServer` : elle dépend de Docker + d'un état seedé,
 * et sa clé RS256 est éphémère. La lancer à part (`nest start` depuis apps/api) et
 * seeder via la fixture `apiSeed`.
 */
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:8081';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  // Le 1er bundle Metro est lent et l'app charge ses données via TanStack Query :
  // on laisse de la marge plutôt que de multiplier les retries fragiles.
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false, // un seul scénario seedé partagé → éviter les courses
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['html'], ['github']] : [['html'], ['list']],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  // Démarre Expo web si besoin ; réutilise un serveur déjà lancé en local.
  webServer: {
    command: 'pnpm --filter @talent-x/mobile exec expo start --web --port 8081',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000, // premier bundle Metro ~15-20 s + marge
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
