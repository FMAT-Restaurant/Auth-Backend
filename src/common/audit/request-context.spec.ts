import type { NextFunction, Request, Response } from 'express';
import {
  getAuditRequestMetadata,
  requestContextMiddleware,
  runWithRequestContext,
} from './request-context';

function fakeRequest(overrides: Record<string, unknown> = {}): Request {
  return { ip: '192.168.0.10', headers: { 'user-agent': 'Jest' }, ...overrides } as unknown as Request;
}

describe('request-context (#33)', () => {
  it('fuera de una petición devuelve todo en null', () => {
    expect(getAuditRequestMetadata()).toEqual({ ipAddress: null, userAgent: null, actorId: null });
  });

  it('expone IP, user-agent y actor de la petición', () => {
    const req = fakeRequest({ user: { userId: 'u-1' } });
    const meta = runWithRequestContext(req, () => getAuditRequestMetadata());
    expect(meta).toEqual({ ipAddress: '192.168.0.10', userAgent: 'Jest', actorId: 'u-1' });
  });

  it('quita el prefijo IPv4 mapeado en IPv6 y usa la IP del socket si falta req.ip', () => {
    expect(
      runWithRequestContext(fakeRequest({ ip: '::ffff:10.1.2.3' }), getAuditRequestMetadata).ipAddress,
    ).toBe('10.1.2.3');
    expect(
      runWithRequestContext(
        fakeRequest({ ip: undefined, socket: { remoteAddress: '::1' } }),
        getAuditRequestMetadata,
      ).ipAddress,
    ).toBe('::1');
  });

  it('recorta valores largos y tolera cabeceras ausentes o actor inválido', () => {
    const meta = runWithRequestContext(
      fakeRequest({
        ip: 'x'.repeat(80),
        headers: { 'user-agent': 'a'.repeat(900) },
        user: { userId: 42 },
      }),
      getAuditRequestMetadata,
    );
    expect(meta.ipAddress).toHaveLength(50);
    expect(meta.userAgent).toHaveLength(500);
    expect(meta.actorId).toBeNull();

    const empty = runWithRequestContext(
      fakeRequest({ ip: '', headers: {} }),
      getAuditRequestMetadata,
    );
    expect(empty).toEqual({ ipAddress: null, userAgent: null, actorId: null });
  });

  it('el middleware mantiene el contexto durante el resto de la petición (también tras await)', async () => {
    const req = fakeRequest({ user: { userId: 'u-2' } });
    const seen = await new Promise((resolve) => {
      const next: NextFunction = () => {
        void Promise.resolve().then(() => resolve(getAuditRequestMetadata().actorId));
      };
      requestContextMiddleware(req, {} as Response, next);
    });
    expect(seen).toBe('u-2');
  });
});
