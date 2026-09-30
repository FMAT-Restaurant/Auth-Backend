import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RoleEnum } from '../database/entities/role.entity';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: any;

  beforeEach(async () => {
    authService = {
      registerRestaurant: jest.fn().mockResolvedValue({
        restaurant: { id: 'rest-1', name: 'Restaurante Test' },
        user: { id: 'usr-1', email: 'admin@test.com', roles: [RoleEnum.ADMINISTRADOR] },
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      }),
      login: jest.fn().mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        user: { id: 'usr-1', roles: [RoleEnum.ADMINISTRADOR] },
        mustChangePassword: false,
      }),
      refresh: jest.fn().mockResolvedValue({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      }),
      changeInitialPassword: jest.fn().mockResolvedValue({
        message: 'Contraseña actualizada exitosamente',
        mustChangePassword: false,
      }),
      getMe: jest.fn().mockResolvedValue({
        id: 'usr-1',
        restaurantId: 'rest-1',
        email: 'admin@test.com',
        roles: [RoleEnum.ADMINISTRADOR],
        views: ['dashboard', 'staff', 'reports'],
      }),
      logout: jest.fn().mockResolvedValue({
        message: 'Sesión cerrada exitosamente',
      }),
      updateProfile: jest.fn().mockResolvedValue({
        message: 'Perfil actualizado exitosamente',
        user: { id: 'usr-1', firstName: 'Juan', lastName: 'Perez' },
      }),
      updateRestaurant: jest.fn().mockResolvedValue({
        message: 'Restaurante actualizado exitosamente',
        restaurant: { id: 'rest-1', name: 'Nuevo Nombre' },
      }),
      deleteAccount: jest.fn().mockResolvedValue({
        message: 'Cuenta eliminada exitosamente',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: authService,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('registerRestaurant', () => {
    it('debería delegar el registro de restaurante a authService.registerRestaurant', async () => {
      const dto = {
        restaurantName: 'Restaurante Test',
        email: 'admin@test.com',
        password: 'Password123!',
      };
      const result = await controller.registerRestaurant(dto);
      expect(authService.registerRestaurant).toHaveBeenCalledWith(dto);
      expect(result).toHaveProperty('restaurant');
    });
  });

  describe('login', () => {
    it('debería delegar el login a authService.login', async () => {
      const dto = {
        identifier: 'admin@test.com',
        password: 'Password123!',
      };
      const result = await controller.login(dto);
      expect(authService.login).toHaveBeenCalledWith(dto);
      expect(result).toHaveProperty('accessToken');
    });
  });

  describe('refresh', () => {
    it('debería delegar la renovación del token a authService.refresh', async () => {
      const dto = { refreshToken: 'refresh-token-uuid' };
      const result = await controller.refresh(dto);
      expect(authService.refresh).toHaveBeenCalledWith(dto);
      expect(result).toHaveProperty('accessToken', 'new-access-token');
    });
  });

  describe('changeInitialPassword', () => {
    it('debería delegar el cambio de contraseña a authService.changeInitialPassword', async () => {
      const dto = {
        currentPassword: 'TempPassword123!',
        newPassword: 'NewPassword123!',
      };
      const result = await controller.changeInitialPassword('usr-1', dto);
      expect(authService.changeInitialPassword).toHaveBeenCalledWith('usr-1', dto);
      expect(result.mustChangePassword).toBe(false);
    });
  });

  describe('getMe', () => {
    it('debería retornar el perfil y vistas del usuario autenticado', async () => {
      const result = await controller.getMe('usr-1');
      expect(authService.getMe).toHaveBeenCalledWith('usr-1');
      expect(result).toHaveProperty('views');
    });
  });

  describe('logout', () => {
    it('debería invalidar las sesiones activas en logout', async () => {
      const result = await controller.logout('usr-1');
      expect(authService.logout).toHaveBeenCalledWith('usr-1');
      expect(result).toHaveProperty('message');
    });
  });

  describe('updateProfile', () => {
    it('debería delegar la actualización de perfil a authService.updateProfile', async () => {
      const dto = { firstName: 'Juan', lastName: 'Perez', phone: '9991234567' };
      const result = await controller.updateProfile('usr-1', dto);
      expect(authService.updateProfile).toHaveBeenCalledWith('usr-1', dto);
      expect(result).toHaveProperty('user');
    });
  });

  describe('updateRestaurant', () => {
    it('debería delegar la actualización de restaurante a authService.updateRestaurant', async () => {
      const dto = { name: 'Nuevo Nombre', address: 'Calle 60 #123' };
      const result = await controller.updateRestaurant('usr-1', dto);
      expect(authService.updateRestaurant).toHaveBeenCalledWith('usr-1', dto);
      expect(result).toHaveProperty('restaurant');
    });
  });

  describe('deleteAccount', () => {
    it('debería delegar la eliminación de cuenta a authService.deleteAccount', async () => {
      const result = await controller.deleteAccount('usr-1');
      expect(authService.deleteAccount).toHaveBeenCalledWith('usr-1');
      expect(result).toHaveProperty('message');
    });
  });
});
