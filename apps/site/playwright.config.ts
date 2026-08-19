import { defineConfig, devices } from '@playwright/test';

/**
 * Config Playwright du site public (TLX-234).
 *
 * Distincte de celle d'`apps/mobile` : celle-ci n'a besoin ni d'Expo, ni de Metro, ni
 * d'une base seedée — la page est statique et l'API est simulée par interception réseau.
 * Elle tourne donc en quelques secondes, sans infrastructure.
 *
 * Rien en dur (cf. CLAUDE.md) :
 *   SITE_PORT      port du serveur statique      (défaut 4173)
 *   SITE_BASE_URL  URL du site sous test         (défaut http://localhost:$SITE_PORT)
 */
const PORT = process.env.SITE_PORT ?? '4173';
const BASE_URL = process.env.SITE_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  // Le serveur statique reproduit les deux comportements de Nginx dont la page dépend
  // (URL sans extension, `/assets/config.js` injecté) — cf. scripts/serve.mjs.
  webServer: {
    command: 'node scripts/serve.mjs',
    // Sonde de démarrage sur une page réelle : la racine du site n'est pas servie
    // (le site n'expose que ses pages), et Playwright ne considère pas un 404 comme prêt.
    url: `${BASE_URL}/reset-password`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    env: { SITE_PORT: PORT, SITE_API_BASE_URL: 'http://api.test/api/v1' },
  },
});
