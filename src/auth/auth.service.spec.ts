import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
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
  let manager: any;
  let dataSource: any;

  beforeEach(async () => {
    userRepo = {
      findOne: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      increment: jest.fn().mockResolvedValue({}),
      create: jest.fn((entity) => ({ id: 'usr-1', ...entity })),
      save: jest.fn((entity) => Promise.resolve({ id: 'usr-1', ...entity })),
      delete: jest.fn().mockResolvedValue({}),
      createQueryBuilder: jest.fn(),
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

    // EntityManager falso para la transacción de setup-admin.
    manager = {
      query: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findOne: jest.fn().mockResolvedValue({ code: RoleEnum.ADMINISTRADOR }),
      create: jest.fn((_entity, data) => ({ ...data })),
      save: jest.fn((entity) => {
        if (!entity.id) entity.id = 'usr-1';
        return Promise.resolve(entity);
      }),
    };
    dataSource = {
      transaction: jest.fn((cb) => cb(manager)),
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
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('getSetupStatus', () => {
    it('debería retornar configured: true si existe algún usuario', async () => {
      userRepo.count.mockResolvedValueOnce(1);
      const result = await service.getSetupStatus();
      expect(result).toEqual({ configured: true });
    });

    it('debería retornar configured: false si la base no tiene usuarios', async () => {
      userRepo.count.mockResolvedValueOnce(0);
      const result = await service.getSetupStatus();
      expect(result).toEqual({ configured: false });
    });

    it('[SEC #12] sigue configurado aunque ya no exista ningún ADMIN (no reabre setup-admin)', async () => {
      // Solo queda personal operativo: el sistema no debe volver a "sin configurar".
      userRepo.count.mockResolvedValueOnce(3);
      userRepo.findOne.mockResolvedValue(null);
      const result = await service.getSetupStatus();
      expect(result).toEqual({ configured: true });
    });
  });

  describe('setupAdmin', () => {
    it('debería configurar al administrador inicial exitosamente', async () => {
      const result = await service.setupAdmin({
        email: 'Admin@FMAT.com ',
        password: 'Password123!',
        firstName: 'Ruben',
        lastName: 'Admin',
      });

      expect(result).toHaveProperty('accessToken', 'mock-jwt-token');
      expect(result.user.roles).toContain(RoleEnum.ADMINISTRADOR);
      expect(result.user.email).toBe('admin@fmat.com');
      expect(manager.save).toHaveBeenCalledWith(
        expect.objectContaining({ userType: UserType.ADMIN }),
      );
      expect(manager.save).toHaveBeenCalledWith(
        expect.objectContaining({ staffId: 'ADM000001', userId: 'usr-1' }),
      );
    });

    it('debería lanzar ConflictException si ya existe cualquier usuario', async () => {
      manager.count.mockResolvedValueOnce(1);

      await expect(
        service.setupAdmin({
          email: 'admin2@fmat.com',
          password: 'Password123!',
        }),
      ).rejects.toThrow(ConflictException);
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('[SEC #13] toma un bloqueo y crea usuario y perfil dentro de la misma transacción', async () => {
      await service.setupAdmin({ email: 'admin@fmat.com', password: 'Password123!' });

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(manager.query).toHaveBeenCalledWith(
        'SELECT pg_advisory_xact_lock($1)',
        [expect.any(Number)],
      );
      // El bloqueo va antes de la comprobación y de cualquier inserción.
      const lockOrder = manager.query.mock.invocationCallOrder[0];
      expect(lockOrder).toBeLessThan(manager.count.mock.invocationCallOrder[0]);
      expect(lockOrder).toBeLessThan(manager.save.mock.invocationCallOrder[0]);
      // Nada se guarda fuera de la transacción.
      expect(userRepo.save).not.toHaveBeenCalled();
      expect(staffProfileRepo.save).not.toHaveBeenCalled();
    });

    it('[SEC #13] con peticiones simultáneas solo una crea al administrador', async () => {
      // Simula el bloqueo de Postgres: cada transacción espera a que termine la anterior.
      let created = 0;
      let queue = Promise.resolve();
      dataSource.transaction.mockImplementation((cb: (m: any) => Promise<unknown>) => {
        const run = queue.then(() =>
          cb({
            ...manager,
            count: jest.fn(() => Promise.resolve(created)),
            save: jest.fn((entity: any) => {
              if (entity.userType === UserType.ADMIN) created += 1;
              if (!entity.id) entity.id = `usr-${created}`;
              return Promise.resolve(entity);
            }),
          }),
        );
        queue = run.then(
          () => undefined,
          () => undefined,
        );
        return run;
      });

      const results = await Promise.allSettled(
        [1, 2, 3, 4, 5].map((n) =>
          service.setupAdmin({ email: `admin${n}@fmat.com`, password: 'Password123!' }),
        ),
      );

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(created).toBe(1);
      const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
      expect(rejected).toHaveLength(4);
      rejected.forEach((r) => expect(r.reason).toBeInstanceOf(ConflictException));
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

    it('[SEC] debería hacer una comparación bcrypt aunque el usuario no exista (evita enumeración por tiempo)', async () => {
      userRepo.findOne.mockResolvedValue(null);
      const compareSpy = jest.spyOn(bcrypt, 'compare');

      await expect(
        service.login({ identifier: 'noexiste@test.com', password: 'Cualquiera123' }),
      ).rejects.toThrow(UnauthorizedException);

      expect(compareSpy).toHaveBeenCalled();
      compareSpy.mockRestore();
    });

    it('[SEC] debería responder el mismo mensaje para usuario inexistente y contraseña incorrecta', async () => {
      userRepo.findOne.mockResolvedValueOnce(null);
      const noUser = service.login({ identifier: 'noexiste@test.com', password: 'x' });
      await expect(noUser).rejects.toThrow('Credenciales inválidas o cuenta deshabilitada');

      const hash = await bcrypt.hash('CorrectPass', 10);
      userRepo.findOne.mockResolvedValueOnce({ id: 'usr-1', passwordHash: hash, isActive: true });
      const wrongPass = service.login({ identifier: 'admin@test.com', password: 'WrongPass' });
      await expect(wrongPass).rejects.toThrow('Credenciales inválidas o cuenta deshabilitada');
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

    it('[SEC #16] no recorta la contraseña: con espacios extra es otra contraseña', async () => {
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

      await expect(
        service.login({
          identifier: 'admin@test.com',
          password: '  CorrectPassword123!  ',
        }),
      ).rejects.toThrow(UnauthorizedException);

      const ok = await service.login({
        identifier: 'admin@test.com',
        password: 'CorrectPassword123!',
      });
      expect(ok).toHaveProperty('accessToken', 'mock-jwt-token');
    });

    it('[SEC #16] una contraseña guardada con espacios solo coincide escrita igual', async () => {
      const hash = await bcrypt.hash('       x', 10);
      userRepo.findOne.mockResolvedValue({
        id: 'usr-1',
        email: 'm@test.com',
        passwordHash: hash,
        passwordStatus: PasswordStatus.ACTIVE,
        isActive: true,
        roles: [],
        staffProfile: { staffId: 'M000001' },
      });

      await expect(
        service.login({ identifier: 'm@test.com', password: 'x' }),
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

    it('[SEC #16] guarda la nueva contraseña tal cual, sin recortar', async () => {
      const hash = await bcrypt.hash('OldTempPass', 10);
      const user: any = {
        id: 'usr-1',
        passwordHash: hash,
        passwordStatus: PasswordStatus.TEMPORARY,
        tokenVersion: 0,
        staffProfile: { staffId: 'M000001' },
      };
      userRepo.findOne.mockResolvedValue(user);

      await service.changeInitialPassword('usr-1', {
        currentPassword: 'OldTempPass',
        newPassword: 'Nueva Clave 2026',
      });

      expect(await bcrypt.compare('Nueva Clave 2026', user.passwordHash)).toBe(true);
      expect(await bcrypt.compare('NuevaClave2026', user.passwordHash)).toBe(false);
    });

    it('[SEC #15] incrementa la versión de sesión para invalidar los access tokens anteriores', async () => {
      const hash = await bcrypt.hash('OldTempPass', 10);
      const user: any = {
        id: 'usr-1',
        passwordHash: hash,
        passwordStatus: PasswordStatus.TEMPORARY,
        tokenVersion: 4,
        staffProfile: { staffId: 'M000001' },
      };
      userRepo.findOne.mockResolvedValue(user);

      await service.changeInitialPassword('usr-1', {
        currentPassword: 'OldTempPass',
        newPassword: 'BrandNewPassword123!',
      });

      expect(user.tokenVersion).toBe(5);
      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ tv: 5 }),
        expect.anything(),
      );
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
      userRepo.count.mockResolvedValueOnce(2); // hay otro administrador activo

      const result = await service.deleteAccount('usr-admin-1');

      expect(userRepo.delete).toHaveBeenCalledWith({ id: 'usr-admin-1' });
      expect(staffProfileRepo.delete).toHaveBeenCalledWith({ userId: 'usr-admin-1' });
      expect(result).toHaveProperty('message');
    });

    it('debería rechazar la eliminación si un usuario STAFF intenta eliminar su cuenta', async () => {
      const staffUser = {
        id: 'usr-staff-1',
        userType: UserType.STAFF,
      };
      userRepo.findOne.mockResolvedValue(staffUser);

      await expect(service.deleteAccount('usr-staff-1')).rejects.toThrow(ForbiddenException);
    });

    it('[SEC #12] impide que el único administrador elimine su cuenta', async () => {
      userRepo.findOne.mockResolvedValue({ id: 'usr-admin-1', userType: UserType.ADMIN });
      userRepo.count.mockResolvedValueOnce(1);

      await expect(service.deleteAccount('usr-admin-1')).rejects.toThrow(ConflictException);
      expect(userRepo.delete).not.toHaveBeenCalled();
      expect(staffProfileRepo.delete).not.toHaveBeenCalled();
    });
  });

  describe('refresh, logout y getMe', () => {
    it('debería renovar tokens con un refreshToken válido', async () => {
      refreshTokenRepo.findOne.mockResolvedValue({
        tokenHash: 'hash',
        isRevoked: false,
        expiresAt: new Date(Date.now() + 60000),
        user: {
          id: 'usr-1',
          isActive: true,
          passwordStatus: PasswordStatus.ACTIVE,
          roles: [{ code: RoleEnum.MESERO, permissions: ['orders:view'] }],
          staffProfile: { staffId: 'M000001' },
        },
      });

      const result = await service.refresh({ refreshToken: 'raw-token' });
      expect(result).toHaveProperty('accessToken', 'mock-jwt-token');
      expect(refreshTokenRepo.save).toHaveBeenCalled();
    });

    it('debería lanzar UnauthorizedException si el refreshToken no existe o expiró', async () => {
      refreshTokenRepo.findOne.mockResolvedValue(null);
      await expect(service.refresh({ refreshToken: 'invalid' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('debería cerrar sesión y revocar refresh tokens', async () => {
      const result = await service.logout('usr-1');
      expect(result).toHaveProperty('message');
      expect(refreshTokenRepo.update).toHaveBeenCalled();
      // [SEC #15] también invalida los access tokens vigentes
      expect(userRepo.increment).toHaveBeenCalledWith({ id: 'usr-1' }, 'tokenVersion', 1);
    });

    it('debería retornar el perfil completo en getMe', async () => {
      userRepo.findOne.mockResolvedValue({
        id: 'usr-1',
        email: 'admin@fmat.com',
        userType: UserType.ADMIN,
        isActive: true,
        passwordStatus: PasswordStatus.ACTIVE,
        roles: [{ code: RoleEnum.ADMINISTRADOR }],
        staffProfile: {
          staffId: 'ADM000001',
          firstName: 'Ruben',
          lastName: 'Perez',
          phone: '9991112233',
        },
        createdAt: new Date(),
      });

      const me = await service.getMe('usr-1');
      expect(me.staffId).toBe('ADM000001');
      expect(me.firstName).toBe('Ruben');
      expect(me.permissions).toEqual(['*']);
    });
  });

  describe('requestPasswordReset', () => {
    it('debería marcar passwordResetRequested: true si el colaborador está activo', async () => {
      const staffUser = {
        id: 'usr-staff-1',
        isActive: true,
        passwordResetRequested: false,
        staffProfile: { staffId: 'M000001' },
      };
      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(staffUser),
      };
      userRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.requestPasswordReset({ identifier: 'M000001' });

      expect(result.message).toBe('Solicitud de cambio de contraseña enviada exitosamente');
      expect(staffUser.passwordResetRequested).toBe(true);
      expect(userRepo.save).toHaveBeenCalledWith(staffUser);
      expect(auditLogRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PASSWORD_RESET_REQUESTED',
        }),
      );
    });

    it('debería retornar mensaje exitoso sin modificar usuario si el empleado no existe o está inactivo', async () => {
      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      };
      userRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.requestPasswordReset({ identifier: 'INEXISTENTE' });

      expect(result.message).toBe('Solicitud de cambio de contraseña enviada exitosamente');
      expect(userRepo.save).not.toHaveBeenCalled();
    });

    it('debería rechazar si el identifier está vacío', async () => {
      await expect(
        service.requestPasswordReset({ identifier: '   ' }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});

