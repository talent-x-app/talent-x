import { Module } from '@nestjs/common';
import { ObjectStorageService } from './object-storage.service';
import { TeammatePresenter } from './teammate-presenter.service';

/**
 * Accès au stockage objet OVH (S3). Module fin et réutilisable : importé par le
 * worker (dépose les archives, nettoie les expirées) et, à terme, par l'endpoint
 * d'export (URL présignée au GET — TLX-033).
 *
 * Expose aussi `TeammatePresenter` (identité minimisée + avatar présigné, ADR-37) —
 * partagé par le roster (groups) et les réactions/kudos nominatifs (ADR-48/49, Palier 2).
 */
@Module({
  providers: [ObjectStorageService, TeammatePresenter],
  exports: [ObjectStorageService, TeammatePresenter],
})
export class StorageModule {}
