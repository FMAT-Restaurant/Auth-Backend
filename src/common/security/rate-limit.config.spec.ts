import type { ExecutionContext } from '@nestjs/common';
import { buildAuthThrottlers, extractIdentifier } from './rate-limit.config';

const contextWithBody = (body: unknown) =>
  ({ switchToHttp: () => ({ getRequest: () => ({ body }) }) }) as unknown as ExecutionContext;

describe('rate-limit.config (#17)', () => {
  describe('extractIdentifier', () => {
    it.each([
      [undefined, null],
      ['texto', null],
      [{}, null],
      [{ identifier: 42 }, null],
      [{ identifier: '   ' }, null],
      [{ identifier: '  Admin@FMAT.mx ' }, 'admin@fmat.mx'],
      [{ identifier: 'm000001' }, 'm000001'],
    ])('%p → %p', (body, expected) => {
      expect(extractIdentifier(body)).toBe(expected);
    });
  });

  describe('buildAuthThrottlers', () => {
    it('usa 10 intentos y ventana de 15 min por defecto', () => {
      const [byIp, byAccount] = buildAuthThrottlers({});
      expect(byIp).toEqual(expect.objectContaining({ name: 'default', ttl: 60_000, limit: 10 }));
      expect(byAccount).toEqual(
        expect.objectContaining({
          name: 'identifier',
          ttl: 15 * 60_000,
          limit: 10,
          blockDuration: 15 * 60_000,
        }),
      );
    });

    it('respeta valores enteros positivos y descarta los inválidos', () => {
      const [byIp, byAccount] = buildAuthThrottlers({
        AUTH_RATE_LIMIT: '50',
        AUTH_IDENTIFIER_RATE_LIMIT: '-3',
        AUTH_IDENTIFIER_WINDOW_MINUTES: '2.5',
      });
      expect(byIp.limit).toBe(50);
      expect(byAccount.limit).toBe(10);
      expect(byAccount.ttl).toBe(15 * 60_000);
    });

    it('el límite por cuenta se omite sin identificador y rastrea por cuenta normalizada', () => {
      const byAccount = buildAuthThrottlers({})[1];
      const skipIf = byAccount.skipIf as (ctx: ExecutionContext) => boolean;
      const getTracker = byAccount.getTracker as (req: Record<string, unknown>) => string;

      expect(skipIf(contextWithBody({ password: 'x' }))).toBe(true);
      expect(skipIf(contextWithBody({ identifier: 'Ana@Fmat.mx' }))).toBe(false);
      expect(getTracker({ body: { identifier: ' Ana@Fmat.mx ' } })).toBe('id:ana@fmat.mx');
      expect(getTracker({ body: {} })).toBe('id:');
    });
  });
});
