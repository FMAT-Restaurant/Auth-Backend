import { Controller, Get, INestApplication, Module, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request = require('supertest');
import {
  applySecurity,
  isOriginAllowed,
  isPrivateAddress,
  parseAllowedOrigins,
  resolveTrustProxy,
} from './security.config';

@Controller()
class PingController {
  @Get('ping')
  ping() {
    return { ok: true };
  }

  @Get('whoami')
  whoami(@Req() req: Request) {
    return { ip: req.ip };
  }
}

@Module({ controllers: [PingController] })
class PingModule {}

describe('[SEC] Configuración de seguridad HTTP', () => {
  describe('isOriginAllowed / parseAllowedOrigins', () => {
    it('permite orígenes locales en cualquier puerto', () => {
      expect(isOriginAllowed('http://localhost:5173', [])).toBe(true);
      expect(isOriginAllowed('http://localhost:5176', [])).toBe(true);
      expect(isOriginAllowed('http://127.0.0.1:3000', [])).toBe(true);
    });

    it('permite peticiones sin Origin (curl, API Gateway, otros backends)', () => {
      expect(isOriginAllowed(undefined, [])).toBe(true);
    });

    it('rechaza orígenes externos que no estén configurados', () => {
      expect(isOriginAllowed('https://sitio-malicioso.com', [])).toBe(false);
      expect(isOriginAllowed('http://localhost.evil.com', [])).toBe(false);
    });

    it('permite orígenes agregados en CORS_ORIGINS', () => {
      const extra = parseAllowedOrigins(' https://restaurante.fmat.mx , https://otro.mx ');
      expect(extra).toEqual(['https://restaurante.fmat.mx', 'https://otro.mx']);
      expect(isOriginAllowed('https://restaurante.fmat.mx', extra)).toBe(true);
    });
  });

  describe('cabeceras de respuesta', () => {
    let app: INestApplication;

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({ imports: [PingModule] }).compile();
      const nestApp = moduleRef.createNestApplication<NestExpressApplication>();
      applySecurity(nestApp);
      await nestApp.init();
      app = nestApp;
    });

    afterAll(async () => {
      await app.close();
    });

    it('no expone la tecnología del servidor (X-Powered-By)', async () => {
      const res = await request(app.getHttpServer()).get('/ping');
      expect(res.headers['x-powered-by']).toBeUndefined();
    });

    it('envía las cabeceras de seguridad básicas', async () => {
      const res = await request(app.getHttpServer()).get('/ping');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('DENY');
      expect(res.headers['content-security-policy']).toBe("default-src 'none';frame-ancestors 'none'");
      expect(res.headers['strict-transport-security']).toBeDefined();
      expect(res.headers['cache-control']).toBe('no-store');
    });

    it('no responde CORS con comodín "*"', async () => {
      const res = await request(app.getHttpServer())
        .get('/ping')
        .set('Origin', 'http://localhost:5173');
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    });

    it('no autoriza por CORS a un sitio externo', async () => {
      const res = await request(app.getHttpServer())
        .get('/ping')
        .set('Origin', 'https://sitio-malicioso.com');
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('[SEC #17] proxies de confianza (X-Forwarded-For)', () => {
    it('reconoce direcciones privadas, loopback y de enlace local', () => {
      expect(isPrivateAddress('127.0.0.1')).toBe(true);
      expect(isPrivateAddress('::ffff:172.18.0.5')).toBe(true);
      expect(isPrivateAddress('10.1.2.3')).toBe(true);
      expect(isPrivateAddress('192.168.1.50')).toBe(true);
      expect(isPrivateAddress('::1')).toBe(true);
      expect(isPrivateAddress('fd00::1')).toBe(true);
      expect(isPrivateAddress('8.8.8.8')).toBe(false);
      expect(isPrivateAddress('172.32.0.1')).toBe(false);
      expect(isPrivateAddress('2001:db8::1')).toBe(false);
    });

    it('por defecto solo confía en el proxy inmediato y solo si es privado', () => {
      const trust = resolveTrustProxy(undefined) as (addr: string, hop: number) => boolean;
      expect(trust('172.18.0.2', 0)).toBe(true); // API Gateway en la red de Docker
      expect(trust('203.0.113.9', 0)).toBe(false); // cliente público directo
      expect(trust('192.168.1.50', 1)).toBe(false); // segundo salto: nunca
    });

    it('permite configurarlo con TRUST_PROXY', () => {
      expect(resolveTrustProxy('false')).toBe(false);
      expect(resolveTrustProxy('true')).toBe(true);
      expect(resolveTrustProxy('2')).toBe(2);
      expect(resolveTrustProxy('10.0.0.5, 172.18.0.0/16')).toBe('10.0.0.5, 172.18.0.0/16');
    });

    describe('IP del cliente detrás del gateway', () => {
      let app: INestApplication;
      const previous = process.env.TRUST_PROXY;

      beforeAll(async () => {
        delete process.env.TRUST_PROXY;
        const moduleRef = await Test.createTestingModule({ imports: [PingModule] }).compile();
        const nestApp = moduleRef.createNestApplication<NestExpressApplication>();
        applySecurity(nestApp);
        await nestApp.init();
        app = nestApp;
      });

      afterAll(async () => {
        await app.close();
        if (previous === undefined) delete process.env.TRUST_PROXY;
        else process.env.TRUST_PROXY = previous;
      });

      it('ignora la IP inventada por el cliente y usa la que agregó el gateway', async () => {
        // El cliente manda "1.2.3.4" y el gateway agrega su IP real (192.168.1.50).
        const res = await request(app.getHttpServer())
          .get('/whoami')
          .set('X-Forwarded-For', '1.2.3.4, 192.168.1.50');
        expect(res.body.ip).toBe('192.168.1.50');
      });
    });
  });
});
