import { Module } from '@nestjs/common';
import { CompetitionsController } from './competitions.controller';
import { CompetitionsService } from './competitions.service';
import { EntriesService } from './entries.service';

/**
 * Compétitions & engagements (TLX-101, ADR-24). OwnershipService est fourni par
 * `AuthorizationModule` (global) ; PrismaModule est global → rien à importer ici.
 * Exporte les services pour l'adaptateur calendrier (TLX-100).
 */
@Module({
  controllers: [CompetitionsController],
  providers: [CompetitionsService, EntriesService],
  exports: [CompetitionsService, EntriesService],
})
export class CompetitionsModule {}
