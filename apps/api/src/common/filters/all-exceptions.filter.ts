import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { getRequestId } from '../context/request-context';
import type { ValidationDetailDto } from '../dto/error.dto';

/** Codes d'erreur stables par défaut, dérivés du statut HTTP (cf. contrat OpenAPI). */
const DEFAULT_ERROR_CODES: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'VALIDATION_FAILED',
  [HttpStatus.TOO_MANY_REQUESTS]: 'TOO_MANY_REQUESTS',
  [HttpStatus.NOT_IMPLEMENTED]: 'NOT_IMPLEMENTED',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'INTERNAL_ERROR',
};

interface NormalizedException {
  statusCode: number;
  error: string;
  message: string;
  details?: ValidationDetailDto[];
}

/**
 * Filtre global : convertit toute exception en enveloppe `Error` du contrat OpenAPI
 * `{ statusCode, error, message, details?, timestamp, path }`.
 *
 * Une exception peut porter un code stable spécifique (ex. TOKEN_REUSE_DETECTED,
 * CONSENT_REQUIRED) via `{ error, message }` dans sa réponse ; sinon le code est
 * dérivé du statut HTTP.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const normalized = this.normalize(exception);

    if (normalized.statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      const line = `${request.method} ${request.url} -> ${normalized.statusCode}`;
      if (exception instanceof HttpException) {
        // 5xx « attendues » (ex. 501 Not Implemented) : pas de stack.
        this.logger.warn(line);
      } else {
        // Erreur inattendue (500) : on conserve la stack pour le diagnostic.
        this.logger.error(line, exception instanceof Error ? exception.stack : String(exception));
      }
    }

    const requestId = getRequestId();
    response.status(normalized.statusCode).json({
      statusCode: normalized.statusCode,
      error: normalized.error,
      message: normalized.message,
      ...(normalized.details ? { details: normalized.details } : {}),
      timestamp: new Date().toISOString(),
      path: request.url,
      ...(requestId ? { requestId } : {}),
    });
  }

  private normalize(exception: unknown): NormalizedException {
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const res = exception.getResponse();
      const fallback = DEFAULT_ERROR_CODES[statusCode] ?? 'ERROR';

      if (typeof res === 'string') {
        return { statusCode, error: fallback, message: res };
      }

      const body = res as Record<string, unknown>;
      const rawMessage = body.message;
      // class-validator renvoie message: string[] → on le mappe en details.
      const details = Array.isArray(rawMessage)
        ? rawMessage.map((m): ValidationDetailDto => ({ message: String(m) }))
        : undefined;

      // On ne conserve `body.error` que s'il s'agit d'un code stable (UPPER_SNAKE,
      // ex. TOKEN_REUSE_DETECTED) volontairement fourni ; sinon on ignore le texte
      // auto de Nest ("Not Implemented") au profit du code dérivé du statut.
      const isStableCode =
        typeof body.error === 'string' && /^[A-Z][A-Z0-9_]*$/.test(body.error);

      return {
        statusCode,
        error: isStableCode ? (body.error as string) : fallback,
        message: details
          ? 'Validation failed'
          : typeof rawMessage === 'string'
            ? rawMessage
            : exception.message,
        ...(Array.isArray(body.details)
          ? { details: body.details as ValidationDetailDto[] }
          : details
            ? { details }
            : {}),
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'INTERNAL_ERROR',
      message: 'Internal server error',
    };
  }
}
