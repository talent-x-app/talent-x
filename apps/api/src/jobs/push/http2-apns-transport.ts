/**
 * Transport HTTP/2 réel vers APNs (TLX-107). Isolé de `ApnsClient` pour que la
 * logique (auth, mapping des raisons, révocation) reste testable sans réseau.
 *
 * Ouvre une session HTTP/2 paresseuse vers l'hôte APNs et la réutilise entre
 * envois (Apple recommande une connexion longue) ; elle est rouverte si fermée.
 */
import { Logger } from '@nestjs/common';
import { connect, type ClientHttp2Session, constants } from 'node:http2';
import type { ApnsResponse, ApnsTransport } from './apns-client';

/** Délai d'attente d'une réponse APNs avant abandon de la requête. */
const REQUEST_TIMEOUT_MS = 10_000;

export class Http2ApnsTransport implements ApnsTransport {
  private readonly logger = new Logger(Http2ApnsTransport.name);
  private session: ClientHttp2Session | null = null;

  constructor(private readonly host: string) {}

  post(path: string, headers: Record<string, string>, body: string): Promise<ApnsResponse> {
    const session = this.ensureSession();
    return new Promise<ApnsResponse>((resolve, reject) => {
      const req = session.request({
        [constants.HTTP2_HEADER_METHOD]: 'POST',
        [constants.HTTP2_HEADER_PATH]: path,
        ...headers,
      });
      req.setTimeout(REQUEST_TIMEOUT_MS, () => req.destroy(new Error('timeout APNs')));

      let status = 0;
      const chunks: Buffer[] = [];
      req.on('response', (resHeaders) => {
        status = Number(resHeaders[constants.HTTP2_HEADER_STATUS]) || 0;
      });
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => resolve({ status, body: Buffer.concat(chunks).toString('utf8') }));
      req.on('error', reject);

      req.end(body);
    });
  }

  /** Session HTTP/2 réutilisée ; (ré)ouverte si absente ou fermée. */
  private ensureSession(): ClientHttp2Session {
    if (this.session && !this.session.closed && !this.session.destroyed) {
      return this.session;
    }
    const session = connect(`https://${this.host}`);
    session.on('error', (err) => this.logger.warn(`Session APNs en erreur : ${err.message}`));
    this.session = session;
    return session;
  }

  /** Ferme proprement la session (arrêt du worker). */
  close(): void {
    this.session?.close();
    this.session = null;
  }
}
