import 'reflect-metadata';
import { HttpStatus, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // Contrat : toutes les routes sous /api/v1 (cf. docs/talent-x-openapi.yaml).
  app.setGlobalPrefix('api/v1');

  // Validation des DTO : rejette les champs inconnus, transforme les types,
  // et renvoie 422 VALIDATION_FAILED conforme au contrat.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
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
