import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * Accès au stockage objet OVH (S3-compatible) — archives d'export RGPD (ADR-13).
 *
 * Le client est construit paresseusement : l'API peut démarrer sans config S3
 * (dev/test), seul le worker (et plus tard l'endpoint d'export) en a besoin.
 * L'URL présignée est générée à la demande (jamais persistée — ADR-13 §3) ; on
 * ne stocke que la clé objet `object_key`.
 */
@Injectable()
export class ObjectStorageService implements OnModuleDestroy {
  private readonly logger = new Logger(ObjectStorageService.name);
  private client?: S3Client;

  constructor(private readonly config: ConfigService) {}

  /** Dépose un objet (archive d'export) et retourne sa clé. */
  async putObject(key: string, body: Buffer | string, contentType: string): Promise<void> {
    await this.s3().send(
      new PutObjectCommand({
        Bucket: this.bucket(),
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    this.logger.log(`Objet déposé : ${key}`);
  }

  /** URL présignée de téléchargement (TTL court), générée au moment de l'appel. */
  async getPresignedDownloadUrl(key: string, ttlSeconds: number): Promise<string> {
    return getSignedUrl(this.s3(), new GetObjectCommand({ Bucket: this.bucket(), Key: key }), {
      expiresIn: ttlSeconds,
    });
  }

  /**
   * URL présignée d'upload (PUT, TTL court) liée à un `contentType` : le client doit
   * envoyer l'objet avec exactement ce `Content-Type` (avatars TLX-124). Le serveur ne
   * touche jamais les octets — l'upload va directement au stockage.
   */
  async getPresignedUploadUrl(
    key: string,
    contentType: string,
    ttlSeconds: number,
  ): Promise<string> {
    return getSignedUrl(
      this.s3(),
      new PutObjectCommand({ Bucket: this.bucket(), Key: key, ContentType: contentType }),
      { expiresIn: ttlSeconds },
    );
  }

  /**
   * Métadonnées d'un objet (taille, type), ou `null` s'il n'existe pas. Sert à valider
   * un upload présigné a posteriori (bornes de taille/format) avant de l'adopter.
   */
  async headObject(key: string): Promise<{ contentLength: number; contentType?: string } | null> {
    try {
      const head = await this.s3().send(new HeadObjectCommand({ Bucket: this.bucket(), Key: key }));
      return { contentLength: head.ContentLength ?? 0, contentType: head.ContentType };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  /** Supprime un objet (nettoyage des archives expirées). */
  async deleteObject(key: string): Promise<void> {
    await this.s3().send(new DeleteObjectCommand({ Bucket: this.bucket(), Key: key }));
    this.logger.log(`Objet supprimé : ${key}`);
  }

  onModuleDestroy(): void {
    this.client?.destroy();
  }

  private bucket(): string {
    return this.require('S3_BUCKET');
  }

  private s3(): S3Client {
    if (!this.client) {
      this.client = new S3Client({
        endpoint: this.require('S3_ENDPOINT'),
        region: this.require('S3_REGION'),
        // OVH Object Storage (S3) exige le path-style addressing.
        forcePathStyle: true,
        credentials: {
          accessKeyId: this.require('S3_ACCESS_KEY_ID'),
          secretAccessKey: this.require('S3_SECRET_ACCESS_KEY'),
        },
      });
    }
    return this.client;
  }

  private require(name: string): string {
    const value = this.config.get<string>(name);
    if (!value) {
      throw new Error(`Configuration stockage objet absente : ${name} requis`);
    }
    return value;
  }
}

/** Détecte un 404 S3 (objet absent) parmi les formes d'erreur du SDK v3. */
function isNotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const e = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e.name === 'NotFound' || e.name === 'NoSuchKey' || e.$metadata?.httpStatusCode === 404;
}
