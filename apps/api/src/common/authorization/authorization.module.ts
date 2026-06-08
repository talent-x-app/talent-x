import { Global, Module } from '@nestjs/common';
import { OwnershipService } from './ownership.service';

/**
 * Autorisation transverse (TLX-024) : expose `OwnershipService` (appartenance +
 * ownership) à toute l'application. Global afin que les modules métier l'injectent
 * sans réimport. PrismaModule étant déjà global, aucune dépendance à importer ici.
 */
@Global()
@Module({
  providers: [OwnershipService],
  exports: [OwnershipService],
})
export class AuthorizationModule {}
