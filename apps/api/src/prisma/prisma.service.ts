import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Client Prisma injectable, branché sur le schéma livré en TLX-012.
 * Gère la connexion au cycle de vie du module Nest.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    // Stade squelette (TLX-011) : la base dev (rôle talentx) peut ne pas exister
    // encore (cf. TLX-004). On ne bloque pas le démarrage ; Prisma se connectera
    // paresseusement à la première requête une fois la base disponible.
    try {
      await this.$connect();
    } catch (error) {
      this.logger.warn(
        `Connexion Prisma indisponible au démarrage : ${(error as Error).message}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
