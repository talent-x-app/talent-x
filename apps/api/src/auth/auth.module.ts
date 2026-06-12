import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { RolesGuard } from '../common/guards/roles.guard';
import { EmailQueueService } from '../jobs/email-queue.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    TokenService,
    // Producteur de la file email transactionnel (forgot-password — TLX-104).
    EmailQueueService,
    // Chaîne de gardes globales, dans cet ordre (Nest exécute les APP_GUARD d'un
    // même module dans l'ordre de déclaration) :
    //   1) JwtAuthGuard — toute route non-@Public exige un access token valide ;
    //      il attache l'utilisateur courant (id + rôle) à la requête.
    //   2) RolesGuard (TLX-024) — applique le RBAC déclaratif (@Roles) à partir
    //      de l'utilisateur attaché ; sans @Roles, laisse passer.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthModule {}
