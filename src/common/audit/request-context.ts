import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextFunction, Request, Response } from 'express';

/**
 * Contexto de la petición HTTP en curso, disponible en cualquier servicio sin
 * tener que pasar `req` por cada método. Lo usa la auditoría (NFR-AUTH-AUD-001,
 * #33) para guardar la IP de origen, el user-agent y quién hizo la acción.
 */
interface RequestContextStore {
  req: Request;
}

const storage = new AsyncLocalStorage<RequestContextStore>();

const MAX_IP_LENGTH = 50; // audit_logs.ipAddress es varchar(50)
const MAX_USER_AGENT_LENGTH = 500;
const IPV4_MAPPED_PREFIX = '::ffff:';

/** Middleware de Express: abre el contexto para el resto de la petición. */
export function requestContextMiddleware(req: Request, _res: Response, next: NextFunction): void {
  storage.run({ req }, () => next());
}

/** Ejecuta `fn` dentro del contexto de `req` (útil en pruebas). */
export function runWithRequestContext<T>(req: Request, fn: () => T): T {
  return storage.run({ req }, fn);
}

export interface AuditRequestMetadata {
  ipAddress: string | null;
  userAgent: string | null;
  /** Usuario autenticado que hace la petición (lo llena JwtStrategy en req.user). */
  actorId: string | null;
}

function normalizeIp(raw: string | undefined): string | null {
  if (!raw) return null;
  const ip = raw.startsWith(IPV4_MAPPED_PREFIX) ? raw.slice(IPV4_MAPPED_PREFIX.length) : raw;
  return ip.slice(0, MAX_IP_LENGTH) || null;
}

/**
 * IP, user-agent y actor de la petición actual. Fuera de una petición HTTP
 * (por ejemplo, el seed de roles al arrancar) todo es null.
 * La IP sale de `req.ip`, que respeta la configuración de `trust proxy`.
 */
export function getAuditRequestMetadata(): AuditRequestMetadata {
  const req = storage.getStore()?.req;
  if (!req) {
    return { ipAddress: null, userAgent: null, actorId: null };
  }
  const userAgentHeader = req.headers?.['user-agent'];
  const userAgent =
    typeof userAgentHeader === 'string' && userAgentHeader.length > 0
      ? userAgentHeader.slice(0, MAX_USER_AGENT_LENGTH)
      : null;
  const user = (req as Request & { user?: { userId?: unknown } }).user;
  const actorId = typeof user?.userId === 'string' ? user.userId : null;

  return {
    ipAddress: normalizeIp(req.ip ?? req.socket?.remoteAddress),
    userAgent,
    actorId,
  };
}
