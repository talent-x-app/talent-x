import { test, expect, type Credentials } from './fixtures';

/**
 * TLX-130 — Vérification live Expo web large : layout adaptatif coach (ResponsiveContent).
 * Contenu **borné/centré** (cap 960 px) sur desktop, **pleine largeur** en mobile, sur les
 * 4 écrans coach (dashboard, constructeur, calendrier, assignation). Capture aux 3 largeurs.
 */

const CAP = 960; // ResponsiveContent : cap ≥ seuil tablette (TLX-123)
const WIDTHS = [
  { name: 'desktop', width: 1280, height: 900, bounded: true },
  { name: 'tablette', width: 800, height: 1100, bounded: false },
  { name: 'mobile', width: 390, height: 844, bounded: false },
] as const;

test.describe('TLX-130 layout adaptatif coach', () => {
  let coach: Credentials;
  let sessionId: string;

  test.beforeAll(async ({ apiSeed }) => {
    const c = await apiSeed.register('coach', 'Coach', 'Layout');
    const ath = await apiSeed.register('athlete', 'Ath', 'Layout');
    const group = await apiSeed.createGroup(c.token);
    await apiSeed.joinGroup(ath.token, group.inviteCode);
    sessionId = await apiSeed.createSession(c.token, { title: 'Sprint layout' });
    coach = c;
  });

  for (const vp of WIDTHS) {
    test(`écrans coach bornés/pleins — ${vp.name} (${vp.width}px)`, async ({ page, apiSeed }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await apiSeed.loginAs(page, coach);

      // `goto` direct sur la route-onglet `/calendar` retombe sur /login à froid
      // (résolution de groupe expo-router) → on y va par l'onglet (client-side).
      const screens: Array<{ go: () => Promise<unknown>; ready: string; tag: string }> = [
        { go: () => page.goto('/'), ready: 'coach-dashboard-subtitle', tag: 'dashboard' },
        {
          go: () => page.getByRole('tab', { name: 'Calendrier' }).click(),
          ready: 'coach-responsive-content',
          tag: 'calendar',
        },
        {
          go: () => page.goto(`/session/${sessionId}/edit`),
          ready: 'session-builder-title',
          tag: 'builder',
        },
        { go: () => page.goto(`/assign/${sessionId}`), ready: 'assign-title', tag: 'assign' },
      ];

      for (const s of screens) {
        await s.go();
        await expect(page.getByTestId(s.ready).first()).toBeVisible({ timeout: 20_000 });
        const content = page.getByTestId('coach-responsive-content').first();
        await expect(content).toBeVisible();
        const box = await content.boundingBox();
        expect(box, `boundingBox absent (${s.tag})`).not.toBeNull();
        if (vp.bounded) {
          // Desktop : le contenu est borné (≤ cap + marge) et ne s'étire pas à 1280.
          expect(box!.width, `${s.tag} non borné à ${vp.width}px`).toBeLessThanOrEqual(CAP + 48);
        } else {
          // Mobile/tablette < cap : le contenu occupe (presque) toute la largeur.
          expect(box!.width, `${s.tag} pas pleine largeur`).toBeGreaterThan(vp.width * 0.8);
        }
        await page.screenshot({ path: `e2e/__screens__/tlx-130-${vp.name}-${s.tag}.png` });
      }
    });
  }
});
