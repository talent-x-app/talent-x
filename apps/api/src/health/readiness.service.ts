import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { ReadinessDto } from './dto/readiness.dto';

/**
 * Évalue la disponibilité des dépendances critiques (§7 TX-OPS-004).
 * Aujourd'hui : la base. Redis et autres dépendances s'ajouteront ici quand
 * elles seront câblées (une entrée par check dans `checks`).
 */
@Injectable()
export class ReadinessService {
  private readonly logger = new Logger(ReadinessService.name);

  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<ReadinessDto> {
    const checks: Record<string, boolean> = {
      database: await this.canReachDatabase(),
    };

    const status = Object.values(checks).every(Boolean) ? 'ready' : 'not_ready';
    return { status, checks };
  }

  private async canReachDatabase(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      this.logger.warn(`Base injoignable : ${(error as Error).message}`);
      return false;
    }
  }
}
