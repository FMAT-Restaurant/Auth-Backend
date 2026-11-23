/**
 * Pruebas e2e por HTTP (supertest) de la capa web del servicio: rutas públicas,
 * cabeceras de seguridad y CORS, con la misma configuración que main.ts.
 * No necesitan base de datos ni broker: las dependencias externas se simulan.
 */
import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as request from 'supertest';

import { AppController } from '../src/app.controller';
import { AppService } from '../src/app.service';
import { EventsService } from '../src/events/events.service';
import { applySecurity } from '../src/common/security/security.config';
import { requestContextMiddleware } from '../src/common/audit/request-context';

describe('Auth-Backend (e2e)', () => {
  let app: NestExpressApplication;
  let brokerStatus: 'connected' | 'disconnected' | 'disabled';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        { provide: EventsService, useValue: { getStatus: () => brokerStatus } },
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.use(requestContextMiddleware);
    applySecurity(app);
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    brokerStatus = 'disabled';
  });

  it('GET / identifica el servicio', async () => {
    const res = await request(app.getHttpServer()).get('/').expect(200);
    expect(res.body).toEqual(
      expect.objectContaining({ status: 'UP', service: 'fmat-auth-backend' }),
    );
  });

  it('GET /health responde healthy con uptime y RabbitMQ deshabilitado', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toEqual({
      status: 'healthy',
      timestamp: expect.any(String),
      uptime: expect.any(Number),
      dependencies: { rabbitmq: 'disabled' },
    });
  });

  it('GET /health responde degraded si RabbitMQ está configurado y caído', async () => {
    brokerStatus = 'disconnected';
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body.status).toBe('degraded');
  });

  it('envía cabeceras de seguridad y no revela la tecnología', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('CORS acepta el frontend local y rechaza orígenes desconocidos', async () => {
    const allowed = await request(app.getHttpServer())
      .get('/health')
      .set('Origin', 'http://localhost:3000');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');

    const denied = await request(app.getHttpServer())
      .get('/health')
      .set('Origin', 'https://sitio-malicioso.example');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('una ruta inexistente responde 404 en JSON', async () => {
    const res = await request(app.getHttpServer()).get('/no-existe').expect(404);
    expect(res.body.statusCode).toBe(404);
  });
});
