import { Module } from '@nestjs/common';
import { ObjectStorageService } from './object-storage.service';

/**
 * Accès au stockage objet OVH (S3). Module fin et réutilisable : importé par le
 * worker (dépose les archives, nettoie les expirées) et, à terme, par l'endpoint
 * d'export (URL présignée au GET — TLX-033).
 */
@Module({
  providers: [ObjectStorageService],
  exports: [ObjectStorageService],
})
export class StorageModule {}
