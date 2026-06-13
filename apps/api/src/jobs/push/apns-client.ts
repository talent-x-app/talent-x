/**
 * Adaptateur APNs (iOS) derrière `PushProvider` (TLX-107, ADR-22 §4).
 *
 * Envoie chaque notification à `POST /3/device/<token>` via HTTP/2 (protocole
 * imposé par Apple), authentifié par un **JWT provider ES256** (clé .p8) — réutilisé
 * tant qu'il est récent (Apple recommande ≤ 1 h, refus si > 1 h). Le contenu reste
 * minimal (titre/corps génériques + `type`/`resourceId`, ADR-10) : aucune donnée
 * métier ne transite par Apple (sous-traitant hors UE, TX-SEC-003 §10/§17).
 *
 * Les jetons d'appareil signalés périmés par Apple (`410 Unregistered`,
 * `400 BadDeviceToken`/`DeviceTokenNotForTopic`) sont remontés dans `invalidTokens`
 * → révoqués par le `NotificationProcessor`.
 */
import { Logger } from '@nestjs/common';
import jwt from 'jsonwebtoken';
import type { ApnsConfig } from './push-config';
import type { PushMessage, PushResult, PushTarget } from '../push-provider';

/** Réponse minimale d'une requête APNs (statut HTTP/2 + corps éventuel). */
export interface ApnsResponse {
  status: number;
  body: string;
}

/**
 * Transport HTTP/2 vers APNs (injectable — un mock réseau le remplace en test).
 * `path` = `/3/device/<token>`, `headers` inclut l'auth et `apns-topic`.
 */
export interface ApnsTransport {
  post(path: string, headers: Record<string, string>, body: string): Promise<ApnsResponse>;
}

/** Hôtes APNs selon l'environnement (Apple). */
const APNS_HOST_PROD = 'api.push.apple.com';
const APNS_HOST_SANDBOX = 'api.sandbox.push.apple.com';

/** Le JWT provider est réutilisé puis régénéré avant la limite Apple d'une heure. */
const TOKEN_REFRESH_MS = 50 * 60 * 1000;

/** Raisons APNs qui signalent un jeton d'appareil à révoquer définitivement. */
const INVALID_TOKEN_REASONS = new Set(['Unregistered', 'BadDeviceToken', 'DeviceTokenNotForTopic']);

export class ApnsClient {
  private readonly logger = new Logger(ApnsClient.name);
  private cachedToken: { jwt: string; issuedAt: number } | null = null;

  constructor(
    private readonly config: ApnsConfig,
    private readonly transport: ApnsTransport,
    /** Horloge injectable (déterminisme en test). */
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Hôte cible (prod vs sandbox) — exposé pour le transport par défaut. */
  get host(): string {
    return this.config.production ? APNS_HOST_PROD : APNS_HOST_SANDBOX;
  }

  async send(targets: PushTarget[], message: PushMessage): Promise<PushResult> {
    if (targets.length === 0) {
      return { invalidTokens: [] };
    }

    const authToken = this.providerToken();
    const body = JSON.stringify({
      aps: { alert: { title: message.title, body: message.body }, sound: 'default' },
      type: message.data.type,
      resourceId: message.data.resourceId,
    });
    const headers = {
      authorization: `bearer ${authToken}`,
      'apns-topic': this.config.bundleId,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'content-type': 'application/json',
    };

    const invalidTokens: string[] = [];
    for (const target of targets) {
      try {
        const res = await this.transport.post(`/3/device/${target.token}`, headers, body);
        if (res.status === 200) {
          continue;
        }
        const reason = this.reasonOf(res.body);
        if (INVALID_TOKEN_REASONS.has(reason)) {
          invalidTokens.push(target.token);
        } else {
          this.logger.warn(`APNs ${res.status} (${reason || 'sans raison'}) — envoi ignoré.`);
        }
      } catch (err) {
        // Panne réseau/transport : on n'invalide pas le jeton (échec transitoire).
        this.logger.warn(`APNs injoignable : ${(err as Error).message}`);
      }
    }
    return { invalidTokens };
  }

  /** Extrait `reason` du corps JSON d'erreur APNs, tolérant aux corps non JSON. */
  private reasonOf(body: string): string {
    if (!body) return '';
    try {
      const parsed = JSON.parse(body) as { reason?: string };
      return parsed.reason ?? '';
    } catch {
      return '';
    }
  }

  /** JWT provider ES256, mis en cache et régénéré avant l'échéance Apple. */
  private providerToken(): string {
    const now = this.now();
    if (this.cachedToken && now - this.cachedToken.issuedAt < TOKEN_REFRESH_MS) {
      return this.cachedToken.jwt;
    }
    const issuedAt = now;
    const signed = jwt.sign(
      { iss: this.config.teamId, iat: Math.floor(issuedAt / 1000) },
      this.config.privateKey,
      { algorithm: 'ES256', keyid: this.config.keyId },
    );
    this.cachedToken = { jwt: signed, issuedAt };
    return signed;
  }
}
