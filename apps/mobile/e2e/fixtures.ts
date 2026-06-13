import {
  test as base,
  expect,
  request as playwrightRequest,
  type APIRequestContext,
  type Page,
} from '@playwright/test';

/**
 * Fixtures E2E Talent-X (cible Expo web / react-native-web).
 *
 *  - `apiSeed` : fabrique des scénarios via l'API REST (UTF-8 propre via le request
 *                context de Playwright). Le contrat fait foi : docs/talent-x-openapi.yaml.
 *  - `loginAs` : connecte un utilisateur via l'UI (testID login-*) et attend l'accueil.
 *
 * ⚠️ Clé RS256 éphémère : on re-seed à CHAQUE run. Rien en dur (cf. CLAUDE.md) : tout
 * passe par les env (E2E_API_URL, E2E_TEST_PASSWORD).
 */

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3000/api/v1';
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD ?? 'SecureP@ss123!';

export interface Credentials {
  email: string;
  password: string;
  id?: string;
  token?: string;
}

/** Bloc d'épreuve minimal pour produire un eventKey canonique (record-detection.ts). */
export interface MarkSpec {
  /** type de bloc chronométré (sprint/endurance/hurdles/interval). */
  type: 'sprint' | 'endurance' | 'hurdles' | 'interval';
  distanceMeters: number;
  /** mesure (s) ; pour un type chrono « min », plus petit = meilleur. */
  timeSeconds: number;
  /** date ISO (YYYY-MM-DD) — fixe l'année de la marque. */
  date: string;
  title?: string;
}

class ApiSeed {
  constructor(private readonly api: APIRequestContext) {}

  /** Vérifie que l'API répond avant tout seed (sinon message explicite). */
  async assertApiUp(): Promise<void> {
    const res = await this.api.get(`${API_URL}/health`);
    expect(
      res.ok(),
      `API injoignable sur ${API_URL} — lancer \`pnpm dev\` depuis apps/api`,
    ).toBeTruthy();
  }

  /** register → renvoie creds enrichis (id, token). */
  async register(
    role: 'coach' | 'athlete',
    firstName: string,
    lastName: string,
    suffix = 'e2e',
  ): Promise<Required<Credentials>> {
    const email = `${role}-${suffix}-${stamp()}-${rand()}@example.com`;
    const res = await this.api.post(`${API_URL}/auth/register`, {
      data: { email, password: TEST_PASSWORD, role, firstName, lastName },
    });
    expect(
      res.ok(),
      `register ${role} a échoué: ${res.status()} ${await safeText(res)}`,
    ).toBeTruthy();
    const body = await res.json();
    return {
      email,
      password: TEST_PASSWORD,
      token: body.accessToken,
      id: body.user?.id ?? body.userId ?? body.id,
    };
  }

  private auth(token: string, extra: Record<string, string> = {}) {
    return { Authorization: `Bearer ${token}`, ...extra };
  }

  private idemp() {
    return { 'Idempotency-Key': `e2e-${stamp()}-${rand()}` };
  }

  private async postOk(
    token: string,
    path: string,
    data: unknown,
    idempotent = false,
  ): Promise<any> {
    const res = await this.api.post(`${API_URL}${path}`, {
      data,
      headers: this.auth(token, idempotent ? this.idemp() : {}),
    });
    expect(res.ok(), `POST ${path} → ${res.status()} ${await safeText(res)}`).toBeTruthy();
    return res.json();
  }

  private async getOk(token: string, path: string): Promise<any> {
    const res = await this.api.get(`${API_URL}${path}`, { headers: this.auth(token) });
    expect(res.ok(), `GET ${path} → ${res.status()} ${await safeText(res)}`).toBeTruthy();
    return res.json();
  }

  async createGroup(
    coachToken: string,
    name = 'Groupe E2E',
  ): Promise<{ id: string; inviteCode: string }> {
    const g = await this.postOk(coachToken, '/groups', { name });
    return { id: g.id, inviteCode: g.inviteCode };
  }

  async joinGroup(athleteToken: string, inviteCode: string): Promise<void> {
    await this.postOk(athleteToken, '/groups/join', { inviteCode });
  }

  /** PUT /users/me/consents — requis avant toute écriture de données perso. */
  async grantConsent(
    token: string,
    type: 'data_processing' | 'coach_access' | 'marketing',
  ): Promise<void> {
    const res = await this.api.put(`${API_URL}/users/me/consents`, {
      data: { type, granted: true, textVersion: '2026-01' },
      headers: this.auth(token),
    });
    expect(res.ok(), `consent ${type} → ${res.status()} ${await safeText(res)}`).toBeTruthy();
  }

  /** Séance coach minimale (titre + 1 bloc sprint typé). Renvoie l'id. */
  async createSession(
    coachToken: string,
    opts: { title?: string; status?: 'draft' | 'published'; distanceMeters?: number } = {},
  ): Promise<string> {
    const distance = opts.distanceMeters ?? 100;
    const s = await this.postOk(coachToken, '/sessions', {
      title: opts.title ?? 'Seance E2E',
      status: opts.status ?? 'published',
      exercises: {
        schemaVersion: 1,
        items: [
          { name: `${distance}m`, order: 1, type: 'sprint', params: { distanceMeters: distance } },
        ],
      },
    });
    return s.id;
  }

  /** Affecte une séance à des athlètes. Renvoie la liste d'affectations créées. */
  async assign(
    coachToken: string,
    sessionId: string,
    opts: {
      athleteIds: string[];
      dueDate?: string;
      recurrence?: { frequency: 'weekly'; until: string };
    },
  ): Promise<Array<{ id: string; sessionId: string; athleteId: string; dueDate?: string }>> {
    const body: Record<string, unknown> = { athleteIds: opts.athleteIds };
    if (opts.dueDate) body.dueDate = opts.dueDate;
    if (opts.recurrence) body.recurrence = opts.recurrence;
    const res = await this.postOk(coachToken, `/sessions/${sessionId}/assign`, body, true);
    return res.data;
  }

  /** Affectations de l'athlète connecté. */
  async myAssignments(
    athleteToken: string,
  ): Promise<Array<{ id: string; sessionId: string; status: string }>> {
    const res = await this.getOk(athleteToken, '/assignments');
    return res.data;
  }

  /** Soumet une perf sprint sur une affectation (idempotent). */
  async submitPerformance(
    athleteToken: string,
    assignmentId: string,
    opts: { distanceMeters?: number; timeSeconds?: number; rpe?: number; notes?: string } = {},
  ): Promise<any> {
    const distance = opts.distanceMeters ?? 100;
    return this.postOk(
      athleteToken,
      `/assignments/${assignmentId}/performance`,
      {
        results: {
          schemaVersion: 1,
          items: [
            {
              exerciseName: `${distance}m`,
              order: 1,
              setResults: [{ set: 1, timeSeconds: opts.timeSeconds ?? 11.5 }],
            },
          ],
        },
        rpe: opts.rpe ?? 7,
        notes: opts.notes,
      },
      true,
    );
  }

  /** Séance libre / journal d'entraînement (ADR-36) : crée séance self_logged + perf. */
  async logTraining(athleteToken: string, mark: MarkSpec): Promise<any> {
    return this.postOk(athleteToken, '/athletes/me/training-log', {
      title: mark.title ?? `Log ${mark.distanceMeters}m`,
      date: mark.date,
      exercises: {
        schemaVersion: 1,
        items: [
          {
            name: `${mark.distanceMeters}m`,
            order: 1,
            type: mark.type,
            params: { distanceMeters: mark.distanceMeters },
          },
        ],
      },
      results: {
        schemaVersion: 1,
        items: [
          {
            exerciseName: `${mark.distanceMeters}m`,
            order: 1,
            setResults: [{ set: 1, timeSeconds: mark.timeSeconds }],
          },
        ],
      },
      rpe: 6,
    });
  }

  /** Commentaire de séance (XOR perf). */
  async postSessionComment(token: string, sessionId: string, body: string): Promise<any> {
    return this.postOk(token, '/comments', { sessionId, body });
  }

  /** Tente un commentaire de séance et renvoie le status HTTP (pour tester un 403). */
  async tryPostSessionComment(token: string, sessionId: string, body: string): Promise<number> {
    const res = await this.api.post(`${API_URL}/comments`, {
      data: { sessionId, body },
      headers: this.auth(token),
    });
    return res.status();
  }

  /** Liste les commentaires d'une séance (du point de vue du token). */
  async listSessionComments(
    token: string,
    sessionId: string,
  ): Promise<Array<{ id: string; body: string }>> {
    const res = await this.getOk(token, `/comments?sessionId=${sessionId}`);
    return res.data;
  }

  /** Nombre de notifications d'un type pour le destinataire. */
  async countNotifs(token: string, type: string): Promise<number> {
    const { data } = await this.getNotifications(token);
    return (data ?? []).filter((n: any) => n.type === type).length;
  }

  /** Crée une compétition (coach). Renvoie l'id. */
  async createCompetition(
    coachToken: string,
    opts: { name?: string; startDate?: string; status?: 'draft' | 'published' } = {},
  ): Promise<string> {
    const c = await this.postOk(coachToken, '/competitions', {
      name: opts.name ?? 'Meeting E2E',
      startDate: opts.startDate ?? '2026-07-01',
      status: opts.status ?? 'published',
      discipline: 'sprint',
    });
    return c.id;
  }

  /** Engage des athlètes sur une compétition (coach). Renvoie les entrées créées. */
  async engageAthletes(
    coachToken: string,
    competitionId: string,
    athleteIds: string[],
    eventLabel = '100 m',
  ): Promise<Array<{ id: string; status: string }>> {
    const res = await this.postOk(
      coachToken,
      `/competitions/${competitionId}/entries`,
      { athleteIds, eventLabel },
      true,
    );
    return res.data;
  }

  /** Assigne une séance et déclenche la notif session_assigned (worker) côté athlète. */
  async getNotifications(token: string): Promise<any> {
    return this.getOk(token, '/notifications');
  }

  /** Préférence de notification (PUT /notifications/preferences). */
  async setNotificationPref(token: string, key: string, value: boolean): Promise<void> {
    const res = await this.api.put(`${API_URL}/notifications/preferences`, {
      data: { [key]: value },
      headers: this.auth(token),
    });
    expect(res.ok(), `pref ${key} → ${res.status()} ${await safeText(res)}`).toBeTruthy();
  }

  /**
   * Navigue vers une route en deep-link (full reload) de façon robuste : sur les routes
   * partagées (athlète ET coach), l'hydratation auth peut momentanément rebondir sur /login.
   * On recharge jusqu'à ce que `readyTestId` apparaisse (token déjà en localStorage).
   */
  async gotoAuthed(page: Page, route: string, readyTestId: string, attempts = 3): Promise<void> {
    for (let i = 0; i < attempts; i++) {
      await page.goto(route);
      const ready = page.getByTestId(readyTestId).first();
      const login = page.getByTestId('login-submit');
      try {
        await expect(ready.or(login)).toBeVisible({ timeout: 15_000 });
      } catch {
        /* retry */
      }
      if ((await ready.count()) > 0 && (await ready.isVisible())) return;
    }
    await expect(page.getByTestId(readyTestId).first()).toBeVisible({ timeout: 15_000 });
  }

  /** Connecte un utilisateur via l'UI et attend que l'écran de login disparaisse. */
  async loginAs(page: Page, creds: Credentials): Promise<void> {
    await page.goto('/');
    // Purge toute session précédente (changement d'utilisateur dans un même test) :
    // le token vit dans localStorage sur web → sans purge, on resterait connecté.
    await page.evaluate(() => globalThis.localStorage?.clear());
    await page.goto('/');
    await page.getByTestId('login-email').fill(creds.email);
    await page.getByTestId('login-password').fill(creds.password);
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('login-submit')).toBeHidden({ timeout: 20_000 });
  }
}

export const test = base.extend<{ apiSeed: ApiSeed }>({
  apiSeed: async ({}, use) => {
    const ctx = await playwrightRequest.newContext();
    const seed = new ApiSeed(ctx);
    await seed.assertApiUp();
    await use(seed);
    await ctx.dispose();
  },
});

export { expect };

function stamp(): string {
  return Date.now().toString(36);
}
function rand(): string {
  return Math.round(Math.random() * 1e6).toString(36);
}
async function safeText(res: { text(): Promise<string> }): Promise<string> {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return '';
  }
}
