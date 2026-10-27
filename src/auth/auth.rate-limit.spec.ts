import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import request = require('supertest');
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

/**
 * Verifica que el login tenga límite de intentos (protección contra fuerza bruta).
 * Antes, un atacante podía probar contraseñas sin ningún límite.
 */
describe('[SEC] Límite de intentos en endpoints públicos de Auth', () => {
  let app: INestApplication;
  const LIMIT = 5;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: LIMIT }])],
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            login: jest.fn().mockResolvedValue({ accessToken: 'token' }),
            requestPasswordReset: jest.fn().mockResolvedValue({ message: 'ok' }),
            getSetupStatus: jest.fn().mockResolvedValue({ configured: true }),
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('bloquea el login con 429 después de demasiados intentos', async () => {
    const body = { identifier: 'M000001', password: 'Intento123' };

    for (let i = 0; i < LIMIT; i++) {
      await request(app.getHttpServer()).post('/api/v1/auth/login').send(body).expect(200);
    }

    await request(app.getHttpServer()).post('/api/v1/auth/login').send(body).expect(429);
  });

  it('bloquea también las solicitudes repetidas de restablecimiento de contraseña', async () => {
    const body = { identifier: 'M000001' };

    for (let i = 0; i < LIMIT; i++) {
      await request(app.getHttpServer())
        .post('/api/v1/auth/request-password-reset')
        .send(body)
        .expect(200);
    }

    await request(app.getHttpServer())
      .post('/api/v1/auth/request-password-reset')
      .send(body)
      .expect(429);
  });

  it('no limita endpoints de solo lectura como setup-status', async () => {
    for (let i = 0; i < LIMIT + 3; i++) {
      await request(app.getHttpServer()).get('/api/v1/auth/setup-status').expect(200);
    }
  });

  it('rechaza contraseñas excesivamente largas en el login', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: 'M000001', password: 'a'.repeat(500) })
      .expect(400);
  });
});
