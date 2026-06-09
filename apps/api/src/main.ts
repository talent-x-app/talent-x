import 'reflect-metadata';
import { HttpStatus, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { JsonLogger } from './common/logging/json-logger';
import { validationExceptionFactory } from './common/validation/validation-exception.factory';

async function bootstrap(): Promise<void> {
  // Logs structurés JSON + correlation ID (§7 TX-OPS-004). bufferLogs : les logs
  // de bootstrap sont rejoués via le logger JSON une fois celui-ci installé.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(new JsonLogger());

  // Contrat : toutes les routes métier sous /api/v1 (cf. docs/talent-x-openapi.yaml).
  // `/metrics` est exclu : endpoint d'exploitation (exposition Prometheus, TLX-83),
  // hors contrat et scrappé à la racine par convention.
  app.setGlobalPrefix('api/v1', { exclude: ['metrics'] });

  // CORS : l'API est consommée par l'app Expo (natif ET cible web/PWA). Le natif
  // n'est pas soumis au CORS, mais le navigateur (Expo web) l'exige. L'auth étant
  // par Bearer (pas de cookie), refléter l'origine ne crée pas de risque CSRF.
  // Production : liste blanche EXPLICITE via CORS_ORIGINS (à défaut, on n'autorise
  // aucune origine cross-site). Dev/test : permissif pour la cible web locale.
  const corsOrigins = process.env.CORS_ORIGINS?.trim();
  const isProd = process.env.NODE_ENV === 'production';
  app.enableCors({
    origin: corsOrigins ? corsOrigins.split(',').map((o) => o.trim()) : !isProd,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'Idempotency-Key'],
  });

  // Validation des DTO : rejette les champs inconnus, transforme les types,
  // et renvoie 422 VALIDATION_FAILED conforme au contrat.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      exceptionFactory: validationExceptionFactory,
    }),
  );

  // Enveloppe d'erreur normalisée { statusCode, error, message, ... }.
  app.useGlobalFilters(new AllExceptionsFilter());

  // Documentation Swagger, à confronter à docs/talent-x-openapi.yaml.
  const config = new DocumentBuilder()
    .setTitle('Talent-X API')
    .setDescription('Squelette généré depuis le contrat OpenAPI (TLX-011).')
    .setVersion('1.0.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/v1/docs', app, document);

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
}

void bootstrap();
