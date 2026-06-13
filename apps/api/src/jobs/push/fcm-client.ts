/**
 * Adaptateur FCM (Android) derrière `PushProvider` (TLX-107, ADR-22 §4).
 *
 * Envoie via l'API **HTTP v1** (`…/projects/<id>/messages:send`), authentifié par un
 * **access token OAuth2** obtenu d'un compte de service (JWT RS256 → endpoint token
 * Google), mis en cache jusqu'à son expiration. Contenu minimal (titre/corps +
 * `type`/`resourceId` en `data`, ADR-10) — aucune donnée métier ne transite par
 * Google (sous-traitant hors UE, TX-SEC-003 §10/§17).
 *
 * Les jetons signalés périmés (`404 UNREGISTERED`, `400 INVALID_ARGUMENT`) sont
 * remontés dans `invalidTokens` → révoqués par le `NotificationProcessor`.
 */
import { Logger } from '@nestjs/common';
import jwt from 'jsonwebtoken';
import type { FcmConfig } from './push-config';
import type { PushMessage, PushResult, PushTarget } from '../push-provider';

/** Sous-ensemble de `fetch` utilisé — injectable pour mocker le réseau en test. */
export type FetchLike = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
  },
) => Promise<{
  status: number;
  ok: boolean;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}>;

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const MESSAGING_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const JWT_BEARER_GRANT = 'urn:ietf:params:oauth:grant-type:jwt-bearer';
/** Marge de sécurité avant l'expiration réelle du token OAuth (renouvellement anticipé). */
const TOKEN_SKEW_MS = 60 * 1000;

/** Codes d'erreur FCM signalant un jeton à révoquer définitivement. */
const INVALID_TOKEN_CODES = new Set(['UNREGISTERED', 'INVALID_ARGUMENT']);

export class FcmClient {
  private readonly logger = new Logger(FcmClient.name);
  private cachedToken: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly config: FcmConfig,
    private readonly fetchFn: FetchLike,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async send(targets: PushTarget[], message: PushMessage): Promise<PushResult> {
    if (targets.length === 0) {
      return { invalidTokens: [] };
    }

    let accessToken: string;
    try {
      accessToken = await this.accessToken();
    } catch (err) {
      // Sans token OAuth, aucun envoi possible — échec transitoire, pas d'invalidation.
      this.logger.warn(`FCM : obtention du token OAuth échouée : ${(err as Error).message}`);
      return { invalidTokens: [] };
    }

    const url = `https://fcm.googleapis.com/v1/projects/${this.config.projectId}/messages:send`;
    const invalidTokens: string[] = [];
    for (const target of targets) {
      const body = JSON.stringify({
        message: {
          token: target.token,
          notification: { title: message.title, body: message.body },
          // Les valeurs `data` FCM doivent être des chaînes.
          data: { type: message.data.type, resourceId: message.data.resourceId },
        },
      });
      try {
        const res = await this.fetchFn(url, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${accessToken}`,
            'content-type': 'application/json',
          },
          body,
        });
        if (res.ok) {
          continue;
        }
        const code = await this.errorCodeOf(res);
        if (INVALID_TOKEN_CODES.has(code)) {
          invalidTokens.push(target.token);
        } else {
          this.logger.warn(`FCM ${res.status} (${code || 'sans code'}) — envoi ignoré.`);
        }
      } catch (err) {
        this.logger.warn(`FCM injoignable : ${(err as Error).message}`);
      }
    }
    return { invalidTokens };
  }

  /** Extrait `error.status`/`errorCode` de la réponse FCM, tolérant aux corps non JSON. */
  private async errorCodeOf(res: {
    json: () => Promise<unknown>;
    text: () => Promise<string>;
  }): Promise<string> {
    try {
      const parsed = (await res.json()) as {
        error?: { status?: string; details?: Array<{ errorCode?: string }> };
      };
      const detailCode = parsed.error?.details?.find((d) => d.errorCode)?.errorCode;
      return detailCode ?? parsed.error?.status ?? '';
    } catch {
      return '';
    }
  }

  /** Access token OAuth2 mis en cache jusqu'à expiration (moins une marge). */
  private async accessToken(): Promise<string> {
    const now = this.now();
    if (this.cachedToken && now < this.cachedToken.expiresAt - TOKEN_SKEW_MS) {
      return this.cachedToken.value;
    }

    const iat = Math.floor(now / 1000);
    const assertion = jwt.sign(
      {
        iss: this.config.clientEmail,
        scope: MESSAGING_SCOPE,
        aud: TOKEN_ENDPOINT,
        iat,
        exp: iat + 3600,
      },
      this.config.privateKey,
      { algorithm: 'RS256' },
    );

    const res = await this.fetchFn(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body:
        `grant_type=${encodeURIComponent(JWT_BEARER_GRANT)}` +
        `&assertion=${encodeURIComponent(assertion)}`,
    });
    if (!res.ok) {
      throw new Error(`endpoint token a répondu ${res.status}`);
    }
    const payload = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!payload.access_token) {
      throw new Error('réponse OAuth sans access_token');
    }
    const ttlMs = (payload.expires_in ?? 3600) * 1000;
    this.cachedToken = { value: payload.access_token, expiresAt: now + ttlMs };
    return payload.access_token;
  }
}
