import {
  test as base,
  expect,
  request as playwrightRequest,
  type APIRequestContext,
  type Page,
} from '@playwright/test';

/**
 * Fixtures E2E Talent-X.
 *
 * Deux briques :
 *  - `apiSeed`  : fabrique un scénario de test via l'API REST (UTF-8 propre grâce au
 *                 request context de Playwright — évite la corruption d'accents du
 *                 shell Git Bash). Voir references/seed-via-api.md pour la séquence.
 *  - `loginAs`  : connecte un utilisateur via l'UI (testID login-*) et attend l'accueil.
 *
 * ⚠️ La clé RS256 de l'API est éphémère : on re-seed à CHAQUE run (pas de storageState
 * réutilisé entre deux sessions API). Rien en dur : tout passe par les env.
 */

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3000/api/v1';
// Mot de passe commun aux comptes de test (respecte la policy : >=12, maj/min/chiffre/symbole)
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD ?? 'SecureP@ss123!';

export interface Credentials {
  email: string;
  password: string;
}

export interface BasicScenario {
  coach: Credentials;
  athlete: Credentials;
  groupId: string;
  inviteCode: string;
  sessionId: string;
}

class ApiSeed {
  constructor(private readonly api: APIRequestContext) {}

  /** Un compte coach + groupe + athlète rattaché + une séance créée. */
  async basicScenario(suffix = 'e2e'): Promise<BasicScenario> {
    const coach: Credentials = {
      email: `coach-${suffix}-${stamp()}@example.com`,
      password: TEST_PASSWORD,
    };
    const athlete: Credentials = {
      email: `athlete-${suffix}-${stamp()}@example.com`,
      password: TEST_PASSWORD,
    };

    const coachToken = await this.register(coach, 'coach', 'Coach', 'Test');

    const group = await this.post(coachToken, '/groups', { name: 'Groupe E2E' });
    const groupId: string = group.id;
    const inviteCode: string = group.inviteCode;

    const athleteToken = await this.register(athlete, 'athlete', 'Athlete', 'Test');
    await this.post(athleteToken, '/groups/join', { inviteCode });

    const session = await this.post(coachToken, '/sessions', {
      title: 'Seance E2E',
      // … champs métier selon docs/talent-x-openapi.yaml
    });
    const sessionId: string = session.id;

    return { coach, athlete, groupId, inviteCode, sessionId };
  }

  /** register → renvoie l'accessToken. role: 'coach' | 'athlete'. */
  private async register(
    creds: Credentials,
    role: 'coach' | 'athlete',
    firstName: string,
    lastName: string,
  ): Promise<string> {
    const res = await this.api.post(`${API_URL}/auth/register`, {
      data: { email: creds.email, password: creds.password, role, firstName, lastName },
    });
    expect(res.ok(), `register ${role} a échoué: ${res.status()}`).toBeTruthy();
    return (await res.json()).accessToken;
  }

  /** POST authentifié avec Idempotency-Key (requis sur certains endpoints, ex. assign). */
  private async post(token: string, path: string, data: unknown): Promise<any> {
    const res = await this.api.post(`${API_URL}${path}`, {
      data,
      headers: {
        Authorization: `Bearer ${token}`,
        'Idempotency-Key': `e2e-${stamp()}-${Math.round(Math.random() * 1e6)}`,
      },
    });
    expect(res.ok(), `POST ${path} a échoué: ${res.status()} ${await res.text()}`).toBeTruthy();
    return res.json();
  }

  /** Connecte un utilisateur via l'UI et attend l'écran d'accueil. */
  async loginAs(page: Page, creds: Credentials): Promise<void> {
    await page.goto('/');
    await page.getByTestId('login-email').fill(creds.email);
    await page.getByTestId('login-password').fill(creds.password);
    await page.getByTestId('login-submit').click();
    // L'écran de login disparaît une fois le token posé → on attend qu'il parte.
    await expect(page.getByTestId('login-submit')).toBeHidden();
  }
}

export const test = base.extend<{ apiSeed: ApiSeed }>({
  apiSeed: async ({}, use) => {
    const ctx = await playwrightRequest.newContext();
    await use(new ApiSeed(ctx));
    await ctx.dispose();
  },
});

export { expect };

function stamp(): string {
  return Date.now().toString(36);
}
