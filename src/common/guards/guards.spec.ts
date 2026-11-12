import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { PasswordStatus } from '../../database/entities/user.entity';
import { RolesGuard } from './roles.guard';
import { JwtAuthGuard } from './jwt-auth.guard';
import { TemporaryPasswordGuard } from './temporary-password.guard';
import { JwtStrategy } from '../../auth/strategies/jwt.strategy';
import { RoleEnum } from '../../database/entities/role.entity';
import { resolveViewsForRoles } from '../constants/views.constant';

describe('Guards, JwtStrategy y Utilidades', () => {
  const createMockContext = (user?: any): ExecutionContext =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    }) as unknown as ExecutionContext;

  describe('RolesGuard', () => {
    it('debería permitir acceso cuando no hay roles requeridos', () => {
      const reflector = { getAllAndOverride: jest.fn().mockReturnValue(undefined) } as unknown as Reflector;
      const guard = new RolesGuard(reflector);
      expect(guard.canActivate(createMockContext())).toBe(true);
    });

    it('debería lanzar ForbiddenException si el usuario no tiene roles', () => {
      const reflector = {
        getAllAndOverride: jest.fn().mockReturnValue([RoleEnum.ADMINISTRADOR]),
      } as unknown as Reflector;
      const guard = new RolesGuard(reflector);
      expect(() => guard.canActivate(createMockContext(undefined))).toThrow(ForbiddenException);
    });

    it('debería lanzar ForbiddenException si el usuario no cuenta con el rol requerido', () => {
      const reflector = {
        getAllAndOverride: jest.fn().mockReturnValue([RoleEnum.ADMINISTRADOR]),
      } as unknown as Reflector;
      const guard = new RolesGuard(reflector);
      expect(() =>
        guard.canActivate(createMockContext({ roles: [RoleEnum.MESERO] })),
      ).toThrow(ForbiddenException);
    });

    it('debería permitir acceso cuando el usuario tiene el rol requerido', () => {
      const reflector = {
        getAllAndOverride: jest.fn().mockReturnValue([RoleEnum.ADMINISTRADOR]),
      } as unknown as Reflector;
      const guard = new RolesGuard(reflector);
      expect(
        guard.canActivate(createMockContext({ roles: [RoleEnum.ADMINISTRADOR] })),
      ).toBe(true);
    });
  });

  describe('JwtAuthGuard', () => {
    it('debería retornar true inmediatamente si la ruta es pública (@Public)', () => {
      const reflector = { getAllAndOverride: jest.fn().mockReturnValue(true) } as unknown as Reflector;
      const guard = new JwtAuthGuard(reflector);
      expect(guard.canActivate(createMockContext())).toBe(true);
    });
  });

  describe('TemporaryPasswordGuard', () => {
    const guard = new TemporaryPasswordGuard();

    it('debería lanzar ForbiddenException si mustChangePassword es true', () => {
      expect(() =>
        guard.canActivate(createMockContext({ mustChangePassword: true })),
      ).toThrow(ForbiddenException);
    });

    it('debería permitir el paso si mustChangePassword es false o no hay usuario', () => {
      expect(guard.canActivate(createMockContext({ mustChangePassword: false }))).toBe(true);
      expect(guard.canActivate(createMockContext(undefined))).toBe(true);
    });
  });

  describe('JwtStrategy', () => {
    const SECRET = 'test-secret-de-al-menos-32-caracteres-123';
    const configService = {
      get: jest.fn().mockReturnValue(SECRET),
    } as unknown as ConfigService;
    let userRepo: { findOne: jest.Mock };
    let strategy: JwtStrategy;

    const activeUser = (overrides: Record<string, unknown> = {}) => ({
      id: 'usr-1',
      email: 'm@fmat.com',
      isActive: true,
      tokenVersion: 0,
      passwordStatus: PasswordStatus.ACTIVE,
      roles: [{ code: 'MESERO' }],
      ...overrides,
    });

    const payload = (overrides: Record<string, unknown> = {}) => ({
      sub: 'usr-1',
      staffId: 'M000001',
      email: 'm@fmat.com',
      roles: ['MESERO'],
      mustChangePassword: false,
      tv: 0,
      ...overrides,
    });

    beforeEach(() => {
      userRepo = { findOne: jest.fn() };
      strategy = new JwtStrategy(configService, userRepo as any);
    });

    it('debería validar un payload válido y devolver el objeto de usuario', async () => {
      userRepo.findOne.mockResolvedValue(activeUser());
      await expect(strategy.validate(payload())).resolves.toEqual({
        userId: 'usr-1',
        staffId: 'M000001',
        email: 'm@fmat.com',
        roles: ['MESERO'],
        mustChangePassword: false,
      });
    });

    it('debería lanzar UnauthorizedException si falta sub en el payload', async () => {
      await expect(strategy.validate(payload({ sub: '' }))).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('[SEC #15] rechaza el token si el usuario fue desactivado', async () => {
      userRepo.findOne.mockResolvedValue(activeUser({ isActive: false }));
      await expect(strategy.validate(payload())).rejects.toThrow(UnauthorizedException);
    });

    it('[SEC #15] rechaza el token si el usuario fue eliminado', async () => {
      userRepo.findOne.mockResolvedValue(null);
      await expect(strategy.validate(payload())).rejects.toThrow(UnauthorizedException);
    });

    it('[SEC #15] rechaza el token si la versión de sesión cambió (roles, contraseña, logout)', async () => {
      userRepo.findOne.mockResolvedValue(activeUser({ tokenVersion: 3 }));
      await expect(strategy.validate(payload({ tv: 2 }))).rejects.toThrow(UnauthorizedException);
    });

    it('[SEC #15] toma los roles y el estado de la contraseña de la base, no del token', async () => {
      userRepo.findOne.mockResolvedValue(
        activeUser({ roles: [{ code: 'HOST' }], passwordStatus: PasswordStatus.TEMPORARY }),
      );
      const result = await strategy.validate(payload({ roles: ['MESERO', 'CHEF_MASTER'] }));
      expect(result.roles).toEqual(['HOST']);
      expect(result.mustChangePassword).toBe(true);
    });

    it('acepta tokens anteriores sin claim tv como versión 0', async () => {
      userRepo.findOne.mockResolvedValue(activeUser());
      const legacy: Record<string, unknown> = payload();
      delete legacy.tv;
      await expect(strategy.validate(legacy as any)).resolves.toHaveProperty('userId', 'usr-1');
    });

    it('[SEC #9] no se puede crear sin un JWT_SECRET válido', () => {
      const missing = { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService;
      expect(() => new JwtStrategy(missing, userRepo as any)).toThrow(/JWT_SECRET/);
    });
  });

  describe('resolveViewsForRoles', () => {
    it('debería resolver vistas para todos los roles del sistema y personalizados', () => {
      const adminViews = resolveViewsForRoles([RoleEnum.ADMINISTRADOR]);
      expect(adminViews.length).toBeGreaterThan(0);

      const staffViews = resolveViewsForRoles([
        RoleEnum.MESERO,
        RoleEnum.CHEF_MASTER,
        RoleEnum.ALMACENISTA,
        RoleEnum.HOST,
        'ROL_CAJERO',
      ]);
      expect(staffViews.length).toBeGreaterThan(0);
    });
  });
});
