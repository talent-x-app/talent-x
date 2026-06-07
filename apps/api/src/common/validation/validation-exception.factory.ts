import { UnprocessableEntityException, type ValidationError } from '@nestjs/common';
import type { ValidationDetailDto } from '../dto/error.dto';

/** Aplatit récursivement les ValidationError (y compris objets imbriqués). */
function toDetails(errors: ValidationError[], parentPath = ''): ValidationDetailDto[] {
  const details: ValidationDetailDto[] = [];

  for (const error of errors) {
    const field = parentPath ? `${parentPath}.${error.property}` : error.property;

    if (error.constraints) {
      for (const [constraint, message] of Object.entries(error.constraints)) {
        details.push({ field, constraint, message });
      }
    }

    if (error.children && error.children.length > 0) {
      details.push(...toDetails(error.children, field));
    }
  }

  return details;
}

/**
 * Fabrique d'exception du ValidationPipe : produit une 422 dont l'enveloppe porte
 * un code stable et des `details` structurés conformes au schéma `ValidationDetail`
 * du contrat OpenAPI ({ field, constraint, message }), au lieu d'un simple string[].
 */
export function validationExceptionFactory(
  errors: ValidationError[],
): UnprocessableEntityException {
  return new UnprocessableEntityException({
    error: 'VALIDATION_FAILED',
    message: 'Validation failed',
    details: toDetails(errors),
  });
}
