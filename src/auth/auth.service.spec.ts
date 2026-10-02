import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import {
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';

import { AuthService } from './auth.service';
import { User, UserType, PasswordStatus } from '../database/entities/user.entity';
import { Role, RoleEnum } from '../database/entities/role.entity';
import { StaffProfile } from '../database/entities/staff-profile.entity';
import { RefreshToken } from '../database/entities/refresh-token.entity';
import { AuditLog } from '../database/entities/audit-log.entity';

describe('AuthService', () => {
  let service: AuthService;
  let userRepo: any;
  let roleRepo: any;
  let staffProfileRepo: any;
  let refreshTokenRepo: any;
  let auditLogRepo: any;
  let jwtService: any;

  beforeEach(async () => {
    userRepo = {
      findOne: jest.fn(),
      create: jest.fn((entity) => ({ id: 'usr-1', ...entity })),
      save: jest.fn((entity) => Promise.resolve({ id: 'usr-1', ...entity })),
      delete: jest.fn().mockResolvedValue({}),
    };

    roleRepo = {
      findOne: jest.fn(),
      create: jest.fn((entity) => entity),
      save: jest.fn((entity) => Promise.resolve(entity)),
    };

    staffProfileRepo = {
      findOne: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn((entity) => entity),
      save: jest.fn((entity) => Promise.resolve(entity)),
      delete: jest.fn().mockResolvedValue({}),
    };

    refreshTokenRepo = {
      create: jest.fn((entity) => ({ id: 'rt-1', ...entity })),
      save: jest.fn((entity) => Promise.resolve({ id: 'rt-1', ...entity })),
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    };

    auditLogRepo = {
      create: jest.fn((entity) => entity),
      save: jest.fn().mockResolvedValue({}),
    };

    jwtService = {
      sign: jest.fn(() => 'mock-jwt-token'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(Role), useValue: roleRepo },
        { provide: getRepositoryToken(StaffProfile), useValue: staffProfileRepo },
        { provide: getRepositoryToken(RefreshToken), useValue: refreshTokenRepo },
        { provide: getRepositoryToken(AuditLog), useValue: auditLogRepo },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('getSetupStatus', () => {
    it('debería retornar configured: true si existe un admin', async () => {
      userRepo.findOne.mockResolvedValueOnce({ id: 'adm-1', userType: UserType.ADMIN });
      const result = await service.getSetupStatus();
      expect(result).toEqual({ configured: true });
    });

    it('debería retornar configured: false si no existe un admin', async () => {
      userRepo.findOne.mockResolvedValueOnce(null);
      const result = await service.getSetupStatus();
      expect(result).toEqual({ configured: false });
    });
  });

  describe('setupAdmin', () => {
    it('debería configurar al administrador inicial exitosamente', async () => {
      userRepo.findOne.mockResolvedValue(null);
      roleRepo.findOne.mockResolvedValue({ code: RoleEnum.ADMINISTRADOR });

      const result = await service.setupAdmin({
        email: 'admin@fmat.com',
        password: 'Password123!',
        firstName: 'Ruben',
        lastName: 'Admin',
      });

      expect(result).toHaveProperty('accessToken', 'mock-jwt-token');
      expect(result.user.roles).toContain(RoleEnum.ADMINISTRADOR);
      expect(userRepo.save).toHaveBeenCalled();
      expect(staffProfileRepo.save).toHaveBeenCalled();
    });

    it('debería lanzar ConflictException si el administrador ya ha sido configurado', async () => {
      userRepo.findOne.mockResolvedValueOnce({ id: 'existing-admin', userType: UserType.ADMIN });

      await expect(
        service.setupAdmin({
          email: 'admin2@fmat.com',
          password: 'Password123!',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('debería lanzar ConflictException si el correo ya existe', async () => {
      userRepo.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'existing-user' });

      await expect(
        service.setupAdmin({
          email: 'duplicate@fmat.com',
          password: 'Password123!',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('debería autenticar al Administrador por email con contraseña correcta', async () => {
      const hash = await bcrypt.hash('CorrectPassword123!', 10);
      userRepo.findOne.mockResolvedValue({
        id: 'usr-1',
        email: 'admin@test.com',
        passwordHash: hash,
        passwordStatus: PasswordStatus.ACTIVE,
        isActive: true,
        roles: [{ code: RoleEnum.ADMINISTRADOR }],
        staffProfile: { staffId: 'ADM000001' },
      });

      const result = await service.login({
        identifier: 'admin@test.com',
        password: 'CorrectPassword123!',
      });

      expect(result).toHaveProperty('accessToken', 'mock-jwt-token');
      expect(result.mustChangePassword).toBe(false);
      expect(result.user.staffId).toBe('ADM000001');
    });

    it('debería autenticar al Personal por Staff ID y marcar mustChangePassword=true si la clave es TEMPORARY', async () => {
      const hash = await bcrypt.hash('TempPassword123!', 10);
      staffProfileRepo.findOne.mockResolvedValue({
        staffId: 'M000001',
        user: {
          id: 'usr-staff-1',
          passwordHash: hash,
          passwordStatus: PasswordStatus.TEMPORARY,
          isActive: true,
          roles: [{ code: RoleEnum.MESERO }],
        },
      });

      const result = await service.login({
        identifier: 'M000001',
        password: 'TempPassword123!',
      });

      expect(result).toHaveProperty('accessToken', 'mock-jwt-token');
      expect(result.mustChangePassword).toBe(true);
      expect(result.user.staffId).toBe('M000001');
    });

    it('debería rechazar login si la contraseña es incorrecta', async () => {
      const hash = await bcrypt.hash('CorrectPass', 10);
      userRepo.findOne.mockResolvedValue({
        id: 'usr-1',
        passwordHash: hash,
        isActive: true,
      });

      await expect(
        service.login({
          identifier: 'admin@test.com',
          password: 'WrongPassword',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('changeInitialPassword', () => {
    it('debería cambiar la contraseña temporal y promover a ACTIVE', async () => {
      const hash = await bcrypt.hash('OldTempPass', 10);
      const user = {
        id: 'usr-1',
        passwordHash: hash,
        passwordStatus: PasswordStatus.TEMPORARY,
        staffProfile: { staffId: 'M000001' },
      };
      userRepo.findOne.mockResolvedValue(user);

      const result = await service.changeInitialPassword('usr-1', {
        currentPassword: 'OldTempPass',
        newPassword: 'BrandNewPassword123!',
      });

      expect(result.mustChangePassword).toBe(false);
      expect(user.passwordStatus).toBe(PasswordStatus.ACTIVE);
      expect(userRepo.save).toHaveBeenCalled();
    });

    it('debería fallar si la contraseña actual no coincide', async () => {
      const hash = await bcrypt.hash('OldTempPass', 10);
      userRepo.findOne.mockResolvedValue({
        id: 'usr-1',
        passwordHash: hash,
      });

      await expect(
        service.changeInitialPassword('usr-1', {
          currentPassword: 'WrongCurrentPass',
          newPassword: 'BrandNewPassword123!',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateProfile', () => {
    it('debería permitir al administrador actualizar su perfil existente', async () => {
      const existingUser = {
        id: 'usr-1',
        userType: UserType.ADMIN,
        staffProfile: { firstName: 'Juan', lastName: 'Perez', phone: '1111111111' },
      };
      userRepo.findOne.mockResolvedValue(existingUser);

      const result = await service.updateProfile('usr-1', {
        firstName: 'Carlos',
        lastName: 'Gomez',
        phone: '9998887766',
      });

      expect(result).toHaveProperty('message');
      expect(result.user.firstName).toBe('Carlos');
      expect(staffProfileRepo.save).toHaveBeenCalled();
    });

    it('debería lanzar ForbiddenException si un usuario STAFF intenta editar su perfil', async () => {
      const staffUser = {
        id: 'usr-staff-1',
        userType: UserType.STAFF,
        staffProfile: { firstName: 'Mesero', lastName: 'Uno' },
      };
      userRepo.findOne.mockResolvedValue(staffUser);

      await expect(
        service.updateProfile('usr-staff-1', {
          firstName: 'Intento',
          lastName: 'Cambio',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('debería crear el perfil si el administrador aún no tenía uno', async () => {
      const existingUser = {
        id: 'usr-admin-1',
        userType: UserType.ADMIN,
        staffProfile: null,
      };
      userRepo.findOne.mockResolvedValue(existingUser);
      staffProfileRepo.create.mockReturnValue({
        userId: 'usr-admin-1',
        staffId: 'ADM000001',
        firstName: 'Admin',
        lastName: 'Principal',
        phone: '1234567890',
      });

      const result = await service.updateProfile('usr-admin-1', {
        firstName: 'Admin',
        lastName: 'Principal',
        phone: '1234567890',
      });

      expect(result).toHaveProperty('user');
      expect(staffProfileRepo.save).toHaveBeenCalled();
    });
  });

  describe('deleteAccount', () => {
    it('debería eliminar la cuenta del usuario', async () => {
      const user = {
        id: 'usr-admin-1',
        userType: UserType.ADMIN,
      };
      userRepo.findOne.mockResolvedValue(user);

      const result = await service.deleteAccount('usr-admin-1');

      expect(userRepo.delete).toHaveBeenCalledWith({ id: 'usr-admin-1' });
      expect(staffProfileRepo.delete).toHaveBeenCalledWith({ userId: 'usr-admin-1' });
      expect(result).toHaveProperty('message');
    });
  });
});
