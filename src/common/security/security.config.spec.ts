import { Controller, Get, INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request = require('supertest');
import {
  applySecurity,
  isOriginAllowed,
  parseAllowedOrigins,
} from './security.config';

@Controller()
class PingController {
  @Get('ping')
  ping() {
    return { ok: true };
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
});
