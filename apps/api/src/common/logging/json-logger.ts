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

/** Clés dont la valeur ne doit jamais apparaître en clair dans les logs (TX-SEC-003 §11/§14). */
const SENSITIVE_KEY = /(password|token|secret|authorization|refresh|cookie|otp|2fa)/i;
const REDACTED = '[redacted]';

/**
 * Masque récursivement la valeur des clés sensibles d'un objet logué (garde-fou
 * défensif : aucune ligne de log ne doit faire fuiter un jeton ou un identifiant).
 * Les messages scalaires (le cas usuel) passent inchangés. Cycles bornés en profondeur.
 */
function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value)) {
    out[key] = SENSITIVE_KEY.test(key) ? REDACTED : redact(val, depth + 1);
  }
  return out;
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
      message: redact(message),
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
