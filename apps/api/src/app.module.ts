import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AssignmentsModule } from './assignments/assignments.module';
import { AuthModule } from './auth/auth.module';
import { CommentsModule } from './comments/comments.module';
import { GroupsModule } from './groups/groups.module';
import { HealthModule } from './health/health.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProgressModule } from './progress/progress.module';
import { SessionsModule } from './sessions/sessions.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    // envFilePath ancré sur la racine du package (apps/api), résolu depuis le
    // fichier compilé (dist/) comme depuis les sources (ts-jest), pour rester
    // correct quel que soit le cwd de lancement (racine du repo, CI, Docker).
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: join(__dirname, '..', '.env'),
    }),
    PrismaModule,
    HealthModule,
    AuthModule,
    UsersModule,
    GroupsModule,
    SessionsModule,
    AssignmentsModule,
    CommentsModule,
    ProgressModule,
    NotificationsModule,
  ],
})
export class AppModule {}
