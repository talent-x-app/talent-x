import type { ValidationError } from '@nestjs/common';
import { validationExceptionFactory } from './validation-exception.factory';

describe('validationExceptionFactory', () => {
  it('produit une 422 avec code stable et details { field, constraint, message }', () => {
    const errors: ValidationError[] = [
      {
        property: 'email',
        constraints: { isEmail: 'email must be an email' },
      } as ValidationError,
    ];

    const ex = validationExceptionFactory(errors);
    const body = ex.getResponse() as Record<string, unknown>;

    expect(ex.getStatus()).toBe(422);
    expect(body.error).toBe('VALIDATION_FAILED');
    expect(body.details).toEqual([
      { field: 'email', constraint: 'isEmail', message: 'email must be an email' },
    ]);
  });

  it('aplatit les erreurs imbriquées avec un chemin pointé', () => {
    const errors: ValidationError[] = [
      {
        property: 'profile',
        children: [
          {
            property: 'sport',
            constraints: { isString: 'sport must be a string' },
          } as ValidationError,
        ],
      } as ValidationError,
    ];

    const body = validationExceptionFactory(errors).getResponse() as Record<string, unknown>;

    expect(body.details).toEqual([
      { field: 'profile.sport', constraint: 'isString', message: 'sport must be a string' },
    ]);
  });
});
