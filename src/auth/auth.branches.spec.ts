/**
 * Ramas de error y casos borde de src/auth que no cubrían las demás pruebas
 * (#35: cobertura de ramas >= 90% en src/auth).
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { DataSource } from 'typeorm';
import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import * as bcrypt from 'bcrypt';

import { AuthService } from './auth.service';
import { AuthController, REFRESH_TOKEN_COOKIE } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { User, UserType, PasswordStatus } from '../database/entities/user.entity';
import { Role, RoleEnum } from '../database/entities/role.entity';
import { StaffProfile } from '../database/entities/staff-profile.entity';
import { RefreshToken } from '../database/entities/refresh-token.entity';
import { AuditLog } from '../database/entities/audit-log.entity';

type Mock = jest.Mock;

describe('AuthService: ramas de error y casos borde', () => {
  let service: AuthService;
  let userRepo: Record<string, Mock>;
  let staffProfileRepo: Record<string, Mock>;
  let refreshTokenRepo: Record<string, Mock>;
  let manager: Record<string, Mock>;

  beforeEach(async () => {
    userRepo = {
      findOne: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      save: jest.fn((e) => Promise.resolve(e)),
      update: jest.fn().mockResolvedValue({}),
      increment: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
    };
    staffProfileRepo = {
      findOne: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn((e) => e),
      save: jest.fn((e) => Promise.resolve(e)),
    };
    refreshTokenRepo = {
      findOne: jest.fn(),
      create: jest.fn((e) => e),
      save: jest.fn((e) => Promise.resolve(e)),
      update: jest.fn().mockResolvedValue({}),
    };
    manager = {
      query: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((_entity, data) => ({ ...data })),
      save: jest.fn((entity) => {
        if (!entity.id) entity.id = 'usr-1';
        return Promise.resolve(entity);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(Role), useValue: { findOne: jest.fn() } },
        { provide: getRepositoryToken(StaffProfile), useValue: staffProfileRepo },
        { provide: getRepositoryToken(RefreshToken), useValue: refreshTokenRepo },
        {
          provide: getRepositoryToken(AuditLog),
          useValue: { create: jest.fn((e) => e), save: jest.fn().mockResolvedValue({}) },
        },
        { provide: JwtService, useValue: { sign: jest.fn(() => 'jwt') } },
        { provide: DataSource, useValue: { transaction: jest.fn((cb) => cb(manager)) } },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  it('setupAdmin rechaza una contraseña igual al correo', async () => {
    await expect(
      service.setupAdmin({ email: 'Admin@Fmat.mx', password: 'admin@fmat.mx' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('setupAdmin crea el rol ADMINISTRADOR si todavía no existe', async () => {
    await service.setupAdmin({ email: 'admin@fmat.mx', password: 'Fmat#Admin2026' });
    expect(manager.create).toHaveBeenCalledWith(
      Role,
      expect.objectContaining({ code: RoleEnum.ADMINISTRADOR, isAssignable: false }),
    );
  });

  it.each([
    [
      'changeInitialPassword',
      (s: AuthService) =>
        s.changeInitialPassword('x', { currentPassword: 'a', newPassword: 'Fmat#Nueva2026' }),
    ],
    ['getMe', (s: AuthService) => s.getMe('x')],
    ['updateProfile', (s: AuthService) => s.updateProfile('x', { firstName: 'A', lastName: 'B' })],
    ['deleteAccount', (s: AuthService) => s.deleteAccount('x')],
  ] as Array<[string, (s: AuthService) => Promise<unknown>]>)(
    '%s responde 404 si el usuario no existe',
    async (_name, call) => {
      userRepo.findOne.mockResolvedValue(null);
      await expect(call(service)).rejects.toThrow(NotFoundException);
    },
  );

  it('refresh sin token responde 401', async () => {
    await expect(service.refresh({ refreshToken: '' })).rejects.toThrow(UnauthorizedException);
  });

  it('refresh con un usuario desactivado responde 401 y revoca el token usado', async () => {
    const record = {
      isRevoked: false,
      expiresAt: new Date(Date.now() + 60_000),
      user: { id: 'u1', isActive: false },
    };
    refreshTokenRepo.findOne.mockResolvedValue(record);
    await expect(service.refresh({ refreshToken: 'r' })).rejects.toThrow('Usuario inactivo');
    expect(record.isRevoked).toBe(true);
  });

  it('updateProfile del admin sin perfil crea uno con otro Staff ID si el siguiente ya existe', async () => {
    userRepo.findOne.mockResolvedValue({ id: 'u1', userType: UserType.ADMIN, roles: [] });
    staffProfileRepo.count.mockResolvedValue(0);
    staffProfileRepo.findOne.mockResolvedValue({ staffId: 'ADM000001' });

    await service.updateProfile('u1', { firstName: ' Ana ', lastName: ' Ruiz ' });

    const created = staffProfileRepo.create.mock.calls[0][0];
    expect(created.staffId).toMatch(/^ADM\d{6}$/);
    expect(created.staffId).not.toBe('ADM000001');
    expect(created).toEqual(
      expect.objectContaining({ firstName: 'Ana', lastName: 'Ruiz', phone: '' }),
    );
  });

  it('login con contraseña vacía falla sin consultar bcrypt contra el hash del usuario', async () => {
    const hash = await bcrypt.hash('Fmat#Real2026', 4);
    userRepo.findOne.mockResolvedValue({
      id: 'u1',
      isActive: true,
      userType: UserType.ADMIN,
      passwordHash: hash,
      passwordStatus: PasswordStatus.ACTIVE,
      roles: [],
    });
    await expect(
      service.login({ identifier: 'admin@fmat.mx', password: '' } as never),
    ).rejects.toThrow(UnauthorizedException);
  });
});

describe('AuthController: cookie del refresh token', () => {
  let controller: AuthController;
  let authService: Record<string, Mock>;

  beforeEach(async () => {
    authService = {
      refresh: jest.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r2' }),
      logout: jest.fn().mockResolvedValue({ message: 'ok' }),
      deleteAccount: jest.fn().mockResolvedValue({ message: 'ok' }),
    };
    const module: TestingModule = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 10 }])],
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();
    controller = module.get(AuthController);
  });

  const reqWithCookie = (cookie: string) =>
    ({ headers: { cookie, origin: 'http://localhost:3000' } }) as unknown as Request;
  const fakeRes = () => ({ cookie: jest.fn(), clearCookie: jest.fn() }) as unknown as Response;

  it('ignora fragmentos de cookie sin "=" y tolera valores mal codificados', async () => {
    await controller.refresh(
      {},
      reqWithCookie(`basura; ${REFRESH_TOKEN_COOKIE}=%E0%A4%A`),
      fakeRes(),
    );
    expect(authService.refresh).toHaveBeenCalledWith({ refreshToken: '%E0%A4%A' });
  });

  it('sin token en el cuerpo ni en la cookie responde 401', async () => {
    await expect(controller.refresh({}, reqWithCookie('otra=1'), fakeRes())).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(controller.refresh({}, { headers: {} } as unknown as Request)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('logout y deleteAccount borran la cookie; sin respuesta HTTP no fallan', async () => {
    const res = fakeRes();
    await controller.logout('u1', reqWithCookie(''), res);
    await controller.deleteAccount('u1', reqWithCookie(''), res);
    expect(res.clearCookie).toHaveBeenCalledTimes(2);
    expect(res.clearCookie).toHaveBeenCalledWith(
      REFRESH_TOKEN_COOKIE,
      expect.objectContaining({ httpOnly: true, path: '/api/v1/auth' }),
    );
    await expect(controller.logout('u1')).resolves.toEqual({ message: 'ok' });
  });
});

describe('JwtStrategy: usuario sin roles cargados', () => {
  it('devuelve listas vacías de roles y permisos', async () => {
    const configService = {
      get: jest.fn().mockReturnValue('test-secret-de-al-menos-32-caracteres-123'),
    } as unknown as ConfigService;
    const userRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'u1',
        email: null,
        isActive: true,
        tokenVersion: 0,
        passwordStatus: PasswordStatus.TEMPORARY,
        roles: undefined,
      }),
    };
    const strategy = new JwtStrategy(configService, userRepo as never);
    await expect(strategy.validate({ sub: 'u1', staffId: 'M1' } as never)).resolves.toEqual(
      expect.objectContaining({ roles: [], permissions: [], mustChangePassword: true }),
    );
  });
});
