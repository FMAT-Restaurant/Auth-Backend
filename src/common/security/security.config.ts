import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';

/**
 * Orígenes locales (cualquier puerto). Cubre el shell de Auth (3000/5173)
 * y los microfrontends de los demás equipos (5174-5178) durante el desarrollo.
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
): boolean {
  if (!origin) return true;
  if (LOCAL_ORIGIN_REGEX.test(origin)) return true;
  return extraOrigins.includes(origin);
}

/**
 * Configuración de seguridad HTTP del microservicio:
 * - Cabeceras de seguridad (helmet) y sin "X-Powered-By".
 * - CORS restringido a orígenes conocidos en lugar de "*".
 * - Respuestas de la API sin caché (contienen tokens y datos personales).
 * - Confianza en proxies de red privada (nginx) para obtener la IP real del cliente,
 *   necesaria para que el límite de intentos funcione por usuario y no por proxy.
 */
export function applySecurity(app: NestExpressApplication): void {
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback, linklocal, uniquelocal');

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
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      callback(null, isOriginAllowed(origin, extraOrigins));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
  });
}
