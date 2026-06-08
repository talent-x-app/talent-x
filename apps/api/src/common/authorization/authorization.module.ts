import { Global, Module } from '@nestjs/common';
import { ConsentGate } from './consent.gate';
import { OwnershipService } from './ownership.service';

/**
 * Autorisation transverse : expose les contrôles d'accès réutilisables à toute
 * l'application (global, pour injection sans réimport) :
 *  - `OwnershipService` (TLX-024) — appartenance (lien coach↔athlète) + ownership ;
 *  - `ConsentGate` (TLX-032) — gating consentement (CONSENT_REQUIRED).
 * PrismaModule étant déjà global, aucune dépendance à importer ici.
 */
@Global()
@Module({
  providers: [OwnershipService, ConsentGate],
  exports: [OwnershipService, ConsentGate],
})
export class AuthorizationModule {}
