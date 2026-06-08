import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
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
