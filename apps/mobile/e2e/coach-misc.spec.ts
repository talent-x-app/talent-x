import { test, expect } from './fixtures';
import { failApi, stubNotifications } from './helpers/network';

/**
 * Suite `coach-misc` (COVERAGE_MATRIX §6) — layout/tab bar, dashboard et centre de
 * notifications côté coach. Profondeur §3.1 :
 *  - Layout : N (4 onglets + nav) + P (athlète redirigé par RoleGuard).
 *  - Dashboard : N (KPIs + section « à revoir ») + ∅ (premier usage).
 *  - Notifications : N (auto-marquage « tout lu » à l'ouverture + badge), ∅, E (smoke).
 *
 * Hors périmètre ici (couvert ailleurs) : le deep-link notif → revue C-08 et l'attente
 * worker sont déjà testés par `tlx-140` ; le layout adaptatif (largeurs) par `tlx-130`.
 */

test.describe('coach-misc — layout, dashboard, notifications', () => {
  // ---------- Layout / tab bar ----------

  test('layout coach — 4 onglets + navigation inter-onglets', async ({ page, apiSeed }) => {
    const w = await apiSeed.coachWorld();
    await apiSeed.loginAs(page, w.coach);
    await expect(page.getByTestId('coach-dashboard-subtitle')).toBeVisible({ timeout: 20_000 });

    for (const name of ['Accueil', 'Athlètes', 'Calendrier', 'Profil']) {
      await expect(page.getByRole('tab', { name })).toBeVisible();
    }

    // Navigation client-side : un marqueur stable par écran (présent hors états ∅/L/E).
    await page.getByRole('tab', { name: 'Athlètes' }).click();
    await expect(page.getByTestId('coach-athletes-templates')).toBeVisible({ timeout: 20_000 });

    await page.getByRole('tab', { name: 'Calendrier' }).click();
    await expect(page.getByTestId('calendar-competitions-link')).toBeVisible({ timeout: 20_000 });

    await page.getByRole('tab', { name: 'Profil' }).click();
    await expect(page.getByTestId('profile-name')).toBeVisible({ timeout: 20_000 });

    await page.getByRole('tab', { name: 'Accueil' }).click();
    await expect(page.getByTestId('coach-dashboard-subtitle')).toBeVisible({ timeout: 20_000 });
  });

  test('RBAC — un athlète n’accède pas à l’espace coach (RoleGuard → login)', async ({
    page,
    apiSeed,
  }) => {
    const w = await apiSeed.coachWorld();
    await apiSeed.loginAs(page, w.athlete);

    // Deep-link direct vers une route coach → RoleGuard (role≠) redirige vers le login.
    await page.goto('/athletes');
    await expect(page.getByTestId('login-submit')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('coach-athletes-templates')).toBeHidden();
  });

  // ---------- Dashboard ----------

  test('dashboard coach — KPIs + section « à revoir » (nominal)', async ({ page, apiSeed }) => {
    // Perf soumise (synchrone via API) ⇒ « à revoir » ≥ 1 et section dédiée affichée.
    const w = await apiSeed.coachWorld({ toReview: true });
    await apiSeed.loginAs(page, w.coach);

    await expect(page.getByTestId('coach-dashboard-kpi-toreview')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('coach-dashboard-kpi-today')).toBeVisible();
    await expect(page.getByTestId('coach-dashboard-toreview-anchor')).toBeVisible();
  });

  test('dashboard coach — état vide (premier usage, aucun athlète lié)', async ({
    page,
    apiSeed,
  }) => {
    const coach = await apiSeed.register('coach', 'Coach', 'EmptyDash');
    await apiSeed.loginAs(page, coach);
    await expect(page.getByTestId('coach-dashboard-empty')).toBeVisible({ timeout: 20_000 });
  });

  // ---------- Notifications ----------

  test('notifications coach — auto-marquage « tout lu » à l’ouverture (badge → 0)', async ({
    page,
    apiSeed,
  }) => {
    // Feed stubbé (le worker async n'est pas requis ici ; round-trip réel = tlx-140).
    const coach = await apiSeed.register('coach', 'Coach', 'StubNotif');
    const probe = await stubNotifications(page, { type: 'performance_submitted' });

    await apiSeed.loginAs(page, coach);
    await expect(page.getByTestId('coach-dashboard-subtitle')).toBeVisible({ timeout: 20_000 });

    // Badge non-lu présent sur la cloche (unreadCount = 1).
    await expect(page.getByTestId('notifications-bell-badge')).toBeVisible({ timeout: 20_000 });

    // Ouverture du centre (route partagée → nav client-side via la cloche).
    await page.getByTestId('notifications-bell').click();
    await expect(page.getByTestId('notifications-title')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('notification-stub-notif-1')).toBeVisible();

    // Auto-marquage « tout lu » → read-all appelé + pastille non-lue disparue.
    await expect.poll(() => probe.wasReadAllCalled(), { timeout: 15_000 }).toBe(true);
    await expect(page.locator('[data-testid$="-unread"]')).toHaveCount(0, { timeout: 15_000 });

    // Retour dashboard → le badge de la cloche est tombé à zéro.
    await page.getByTestId('notifications-back').click();
    await expect(page.getByTestId('notifications-bell-badge')).toBeHidden({ timeout: 15_000 });
  });

  test('notifications coach — état vide', async ({ page, apiSeed }) => {
    const coach = await apiSeed.register('coach', 'Coach', 'EmptyNotif');
    await apiSeed.loginAs(page, coach);
    await expect(page.getByTestId('coach-dashboard-subtitle')).toBeVisible({ timeout: 20_000 });

    await page.getByTestId('notifications-bell').click();
    await expect(page.getByTestId('notifications-empty')).toBeVisible({ timeout: 20_000 });
  });

  test('notifications coach — erreur serveur (E smoke + retry)', async ({ page, apiSeed }) => {
    const coach = await apiSeed.register('coach', 'Coach', 'ErrNotif');
    await failApi(page, 'notifications', 500); // intercepte le feed (et la cloche)

    await apiSeed.loginAs(page, coach);
    await expect(page.getByTestId('coach-dashboard-subtitle')).toBeVisible({ timeout: 20_000 });

    await page.getByTestId('notifications-bell').click();
    await expect(page.getByTestId('notifications-error')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('notifications-retry')).toBeVisible();
  });
});
