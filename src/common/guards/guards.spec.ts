import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
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
    const configService = {
      get: jest.fn().mockReturnValue('test-secret'),
    } as unknown as ConfigService;
    const strategy = new JwtStrategy(configService);

    it('debería validar un payload válido y devolver el objeto de usuario', () => {
      const result = strategy.validate({
        sub: 'usr-1',
        staffId: 'M000001',
        email: 'm@fmat.com',
        roles: ['MESERO'],
        mustChangePassword: false,
      });
      expect(result).toEqual({
        userId: 'usr-1',
        staffId: 'M000001',
        email: 'm@fmat.com',
        roles: ['MESERO'],
        mustChangePassword: false,
      });
    });

    it('debería lanzar UnauthorizedException si falta sub en el payload', () => {
      expect(() =>
        strategy.validate({
          sub: '',
          staffId: 'M000001',
          email: null,
          roles: [],
          mustChangePassword: true,
        }),
      ).toThrow(UnauthorizedException);
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
