import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule, type ThrottlerModuleOptions } from '@nestjs/throttler';
import { STRICT_THROTTLE_KEY } from '../common/decorators/strict-throttle.decorator';
import { RedisThrottlerStorage } from './redis-throttler.storage';

@Module({
  providers: [RedisThrottlerStorage],
  exports: [RedisThrottlerStorage],
})
class ThrottlerStorageModule {}

/**
 * Construit la configuration du limiteur depuis l'environnement validé
 * (env.validation.ts — jamais de seuil en dur ici) :
 *
 *  - « global »  : plafond large par IP sur toutes les routes ;
 *  - « strict »  : seuils resserrés, uniquement sur les routes marquées
 *    @StrictThrottle() (login, register, forgot-password — TLX-233).
 *
 * Désactivé (THROTTLE_ENABLED=false, défaut en dev/test) → aucun throttler :
 * le garde laisse tout passer. Stockage Redis dès que REDIS_URL est configuré
 * (compteurs partagés entre instances) ; mémoire sinon (dev/test sans Redis).
 */
export function buildThrottlerOptions(
  config: ConfigService,
  redisStorage: RedisThrottlerStorage,
): ThrottlerModuleOptions {
  if (!config.get<boolean>('THROTTLE_ENABLED')) {
    return { throttlers: [] };
  }
  const reflector = new Reflector();
  return {
    errorMessage: 'Trop de requêtes. Réessaie dans quelques instants.',
    throttlers: [
      {
        name: 'global',
        ttl: config.getOrThrow<number>('THROTTLE_TTL_SECONDS') * 1000,
        limit: config.getOrThrow<number>('THROTTLE_LIMIT'),
      },
      {
        name: 'strict',
        ttl: config.getOrThrow<number>('THROTTLE_STRICT_TTL_SECONDS') * 1000,
        limit: config.getOrThrow<number>('THROTTLE_STRICT_LIMIT'),
        // Ne s'applique qu'aux handlers marqués @StrictThrottle().
        skipIf: (context) => reflector.get(STRICT_THROTTLE_KEY, context.getHandler()) !== true,
      },
    ],
    ...(config.get<string>('REDIS_URL') ? { storage: redisStorage } : {}),
  };
}

/**
 * Rate limiting global de l'API (TLX-233, TX-SEC-003 « credential stuffing »).
 * Importé AVANT AuthModule dans AppModule : le garde s'exécute en tête de la
 * chaîne APP_GUARD et compte donc aussi les requêtes qui finiront en 401.
 */
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [ThrottlerStorageModule],
      inject: [ConfigService, RedisThrottlerStorage],
      useFactory: buildThrottlerOptions,
    }),
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class ThrottlingModule {}
