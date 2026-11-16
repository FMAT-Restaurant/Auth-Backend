import type { ExecutionContext } from '@nestjs/common';
import type { ThrottlerOptions } from '@nestjs/throttler';

const MINUTE = 60_000;

function readPositiveInt(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

/** Identificador del cuerpo (correo o Staff ID) normalizado, o null si no hay. */
export function extractIdentifier(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const raw = (body as Record<string, unknown>).identifier;
  if (typeof raw !== 'string') return null;
  const normalized = raw.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function requestBody(context: ExecutionContext): unknown {
  return context.switchToHttp().getRequest<{ body?: unknown }>().body;
}

/**
 * Límites de intentos para los endpoints públicos de Auth (se aplican donde se
 * usa ThrottlerGuard, ver AuthController):
 *
 * - `default`: por IP del cliente. Frena a quien prueba muchas cuentas.
 * - `identifier`: por cuenta (correo o Staff ID). No depende de la IP, así que
 *   cambiar la cabecera X-Forwarded-For en cada intento ya no sirve para
 *   saltarse el límite (#17). Al superarlo, la cuenta queda bloqueada un rato.
 */
export function buildAuthThrottlers(env: NodeJS.ProcessEnv = process.env): ThrottlerOptions[] {
  const identifierWindowMs =
    readPositiveInt(env.AUTH_IDENTIFIER_WINDOW_MINUTES, 15) * MINUTE;

  return [
    {
      name: 'default',
      ttl: MINUTE,
      limit: readPositiveInt(env.AUTH_RATE_LIMIT, 10),
    },
    {
      name: 'identifier',
      ttl: identifierWindowMs,
      limit: readPositiveInt(env.AUTH_IDENTIFIER_RATE_LIMIT, 10),
      blockDuration: identifierWindowMs,
      skipIf: (context) => extractIdentifier(requestBody(context)) === null,
      getTracker: (req) => `id:${extractIdentifier(req.body) ?? ''}`,
    },
  ];
}
