import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/** Expose PrismaService à toute l'application (module global). */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
