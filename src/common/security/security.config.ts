import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';

/**
 * Orígenes locales (cualquier puerto). Cubre el shell de Auth (3000/5173)
 * y los microfrontends de los demás equipos (5174-5178) durante el desarrollo.
 * Solo se aceptan automáticamente fuera de producción (#22).
 */
const LOCAL_ORIGIN_REGEX = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export function parseAllowedOrigins(raw?: string): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
}

/**
 * Decide si un origen puede consumir la API desde el navegador.
 * Las peticiones sin cabecera Origin (curl, API Gateway, otros backends)
 * no pasan por CORS y siempre se permiten.
 */
export function isOriginAllowed(
  origin: string | undefined,
  extraOrigins: string[],
  allowLocalOrigins = true,
): boolean {
  if (!origin) return true;
  if (allowLocalOrigins && LOCAL_ORIGIN_REGEX.test(origin)) return true;
  return extraOrigins.includes(origin);
}

/** true si la dirección es loopback, de enlace local o de red privada. */
export function isPrivateAddress(address: string): boolean {
  const ip = address.toLowerCase().replace(/^::ffff:/, '');
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 127 ||
      a === 10 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254)
    );
  }
  return ip === '::1' || /^f[cd][0-9a-f]{2}:/.test(ip) || /^fe[89ab][0-9a-f]:/.test(ip);
}

type TrustProxySetting = boolean | number | string | ((address: string, hop: number) => boolean);

/**
 * Qué proxies se consideran confiables para leer la IP real de X-Forwarded-For.
 *
 * Antes se confiaba en cualquier dirección privada, así que un cliente de la red
 * local (o de la red de Docker) podía inventar su IP con X-Forwarded-For y
 * saltarse el límite de intentos (#17). Ahora, por defecto, solo se confía en un
 * salto (el API Gateway o nginx que está justo delante) y solo si es privado.
 *
 * Se puede cambiar con TRUST_PROXY: "false", un número de saltos ("1", "2") o
 * una lista de direcciones/subredes ("10.0.0.5, 172.18.0.0/16").
 */
export function resolveTrustProxy(raw: string | undefined): TrustProxySetting {
  const value = raw?.trim();
  if (!value) {
    return (address: string, hop: number) => hop === 0 && isPrivateAddress(address);
  }
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^\d+$/.test(value)) return Number(value);
  return value;
}

/**
 * Configuración de seguridad HTTP del microservicio:
 * - Cabeceras de seguridad (helmet) y sin "X-Powered-By".
 * - CORS restringido a orígenes conocidos en lugar de "*".
 * - Respuestas de la API sin caché (contienen tokens y datos personales).
 * - Confianza solo en el proxy inmediato (API Gateway / nginx) para obtener la IP
 *   real del cliente, sin aceptar IPs inventadas por el propio cliente.
 */
export function applySecurity(app: NestExpressApplication): void {
  app.disable('x-powered-by');
  app.set('trust proxy', resolveTrustProxy(process.env.TRUST_PROXY));

  // La API solo devuelve JSON, así que su CSP puede ser la más estricta posible:
  // no se permite cargar nada ni incrustar las respuestas en otra página.
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      frameguard: { action: 'deny' },
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );

  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    next();
  });

  const extraOrigins = parseAllowedOrigins(process.env.CORS_ORIGINS);
  // En producción solo valen los orígenes de CORS_ORIGINS (#22).
  const allowLocalOrigins = process.env.NODE_ENV !== 'production';
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      callback(null, isOriginAllowed(origin, extraOrigins, allowLocalOrigins));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
  });
}
