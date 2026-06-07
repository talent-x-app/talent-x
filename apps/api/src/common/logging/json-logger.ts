import { type LoggerService, type LogLevel } from '@nestjs/common';
import { getRequestId } from '../context/request-context';

interface LogRecord {
  time: string;
  level: LogLevel;
  message: unknown;
  context?: string;
  requestId?: string;
  trace?: string;
}

/**
 * Logger applicatif : émet une ligne JSON par entrée (logs structurés, §7 TX-OPS-004),
 * enrichie du correlation ID de la requête courante. Branché via app.useLogger().
 */
export class JsonLogger implements LoggerService {
  log(message: unknown, context?: string): void {
    this.write('log', message, context);
  }

  error(message: unknown, trace?: string, context?: string): void {
    this.write('error', message, context, trace);
  }

  warn(message: unknown, context?: string): void {
    this.write('warn', message, context);
  }

  debug(message: unknown, context?: string): void {
    this.write('debug', message, context);
  }

  verbose(message: unknown, context?: string): void {
    this.write('verbose', message, context);
  }

  private write(level: LogLevel, message: unknown, context?: string, trace?: string): void {
    const record: LogRecord = {
      time: new Date().toISOString(),
      level,
      message,
      ...(context ? { context } : {}),
      ...(getRequestId() ? { requestId: getRequestId() } : {}),
      ...(trace ? { trace } : {}),
    };
    const line = JSON.stringify(record);
    if (level === 'error') {
      process.stderr.write(`${line}\n`);
    } else {
      process.stdout.write(`${line}\n`);
    }
  }
}
