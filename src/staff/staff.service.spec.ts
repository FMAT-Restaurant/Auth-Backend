import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { StaffService } from './staff.service';
import { User, PasswordStatus } from '../database/entities/user.entity';
import { StaffProfile } from '../database/entities/staff-profile.entity';
import { Role, RoleEnum } from '../database/entities/role.entity';
import { RefreshToken } from '../database/entities/refresh-token.entity';
import { AuditLog } from '../database/entities/audit-log.entity';
import { EventsService } from '../events/events.service';

describe('StaffService', () => {
  let service: StaffService;
  let userRepo: any;
  let staffProfileRepo: any;
  let roleRepo: any;
  let refreshTokenRepo: any;
  let auditLogRepo: any;
  let eventsService: any;

  beforeEach(async () => {
    userRepo = {
      create: jest.fn((entity) => ({ id: 'usr-staff-1', ...entity })),
      save: jest.fn((entity) => Promise.resolve({ id: 'usr-staff-1', ...entity })),
      createQueryBuilder: jest.fn(),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    staffProfileRepo = {
      create: jest.fn((entity) => ({ id: 'profile-1', ...entity })),
      save: jest.fn((entity) => Promise.resolve({ id: 'profile-1', ...entity })),
      count: jest.fn().mockResolvedValue(0),
      findOne: jest.fn().mockResolvedValue(null),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    roleRepo = {
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((entity) => entity),
      save: jest.fn((entity) => Promise.resolve(entity)),
    };

    refreshTokenRepo = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    auditLogRepo = {
      create: jest.fn((entity) => entity),
      save: jest.fn().mockResolvedValue({}),
    };

    eventsService = {
      publishStaffCreated: jest.fn().mockResolvedValue(undefined),
      publishStaffRolesUpdated: jest.fn().mockResolvedValue(undefined),
      publishStaffStatusChanged: jest.fn().mockResolvedValue(undefined),
      publishStaffDeleted: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StaffService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(StaffProfile), useValue: staffProfileRepo },
        { provide: getRepositoryToken(Role), useValue: roleRepo },
        { provide: getRepositoryToken(RefreshToken), useValue: refreshTokenRepo },
        { provide: getRepositoryToken(AuditLog), useValue: auditLogRepo },
        { provide: EventsService, useValue: eventsService },
      ],
    }).compile();

    service = module.get<StaffService>(StaffService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createStaff', () => {
    it('debería rechazar si se intenta asignar el rol ADMINISTRADOR', async () => {
      await expect(
        service.createStaff({
          firstName: 'Juan',
          lastName: 'Pérez',
          roles: [RoleEnum.ADMINISTRADOR],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('debería rechazar si la lista de roles está vacía', async () => {
      await expect(
        service.createStaff({
          firstName: 'Juan',
          lastName: 'Pérez',
          roles: [],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('debería registrar un nuevo miembro del personal y publicar evento en RabbitMQ sin restaurantId', async () => {
      roleRepo.find.mockResolvedValue([
        { id: '1', code: RoleEnum.MESERO, name: RoleEnum.MESERO },
      ]);
      staffProfileRepo.count.mockResolvedValue(0);
      staffProfileRepo.findOne.mockResolvedValue(null);

      const result = await service.createStaff({
        firstName: 'Juan',
        lastName: 'Pérez',
        phone: '9991234567',
        roles: [RoleEnum.MESERO],
      });

      expect(result).toHaveProperty('staffId', 'M000001');
      expect(result).toHaveProperty('temporaryPassword');
      expect(userRepo.save).toHaveBeenCalled();
      expect(staffProfileRepo.save).toHaveBeenCalled();
      expect(eventsService.publishStaffCreated).toHaveBeenCalledWith(
        expect.objectContaining({
          staffId: 'M000001',
          roles: [RoleEnum.MESERO],
        }),
      );
      expect(eventsService.publishStaffCreated).not.toHaveBeenCalledWith(
        expect.objectContaining({ restaurantId: expect.anything() }),
      );
    });

    it('[SEC #14] guarda solo el hash de la contraseña temporal y la devuelve una vez', async () => {
      roleRepo.find.mockResolvedValue([{ code: RoleEnum.MESERO }]);

      const result = await service.createStaff({
        firstName: 'Juan',
        lastName: 'Pérez',
        roles: [RoleEnum.MESERO],
      });

      const savedUser = userRepo.save.mock.calls[0][0];
      expect(savedUser).not.toHaveProperty('temporaryPassword');
      expect(JSON.stringify(savedUser)).not.toContain(result.temporaryPassword);
      expect(await bcrypt.compare(result.temporaryPassword, savedUser.passwordHash)).toBe(true);
    });

    it('debería asignar el prefijo correcto según el rol primario', async () => {
      roleRepo.find.mockResolvedValue([
        { id: '1', code: RoleEnum.HOST, name: RoleEnum.HOST },
      ]);
      staffProfileRepo.count.mockResolvedValue(10);
      staffProfileRepo.findOne.mockResolvedValue(null);

      const result = await service.createStaff({
        firstName: 'Ana',
        lastName: 'Gómez',
        roles: [RoleEnum.HOST],
      });

      expect(result.staffId).toBe('H000011');
    });
  });

  describe('[SEC #18] asignación de roles', () => {
    const userQb = (user: any) => ({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(user),
    });

    it('no crea roles que no existen', async () => {
      roleRepo.find.mockResolvedValue([]);

      await expect(
        service.createStaff({ firstName: 'Eva', lastName: 'Paz', roles: ['ROL_INVENTADO'] }),
      ).rejects.toThrow(/no existen: ROL_INVENTADO/);
      expect(roleRepo.save).not.toHaveBeenCalled();
      expect(userRepo.save).not.toHaveBeenCalled();
    });

    it('"administrador" en minúsculas se trata como ADMINISTRADOR y se rechaza', async () => {
      await expect(
        service.createStaff({ firstName: 'Eva', lastName: 'Paz', roles: ['administrador'] }),
      ).rejects.toThrow(/ADMINISTRADOR no es asignable/);
      expect(roleRepo.save).not.toHaveBeenCalled();
    });

    it('respeta isAssignable', async () => {
      roleRepo.find.mockResolvedValue([{ code: 'ROL_GERENTE', isAssignable: false }]);

      await expect(
        service.createStaff({ firstName: 'Eva', lastName: 'Paz', roles: ['ROL_GERENTE'] }),
      ).rejects.toThrow(/no se pueden asignar: ROL_GERENTE/);
    });

    it('normaliza mayúsculas y duplicados al asignar', async () => {
      roleRepo.find.mockResolvedValue([{ code: RoleEnum.MESERO, isAssignable: true }]);

      const result = await service.createStaff({
        firstName: 'Eva',
        lastName: 'Paz',
        roles: ['mesero', ' MESERO '],
      });
      expect(result.user.roles).toEqual([RoleEnum.MESERO]);
    });

    it('updateRoles también rechaza roles inexistentes', async () => {
      userRepo.createQueryBuilder.mockReturnValue(userQb({ id: 'usr-1', roles: [] }));
      roleRepo.find.mockResolvedValue([{ code: RoleEnum.HOST, isAssignable: true }]);

      await expect(
        service.updateRoles('usr-1', { roles: [RoleEnum.HOST, 'ROL_NO_EXISTE'] }),
      ).rejects.toThrow(BadRequestException);
      expect(userRepo.save).not.toHaveBeenCalled();
    });

    it('updateStaff también rechaza roles inexistentes', async () => {
      userRepo.createQueryBuilder.mockReturnValue(
        userQb({ id: 'usr-1', roles: [], staffProfile: { firstName: 'A', lastName: 'B' } }),
      );
      roleRepo.find.mockResolvedValue([]);

      await expect(
        service.updateStaff('usr-1', { roles: ['ROL_NO_EXISTE'] }),
      ).rejects.toThrow(BadRequestException);
      expect(userRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('findAllStaff', () => {
    it('debería retornar el listado de personal', async () => {
      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          {
            id: 'usr-1',
            isActive: true,
            passwordStatus: PasswordStatus.ACTIVE,
            createdAt: new Date(),
            staffProfile: {
              staffId: 'M000001',
              firstName: 'Juan',
              lastName: 'Pérez',
              phone: '9991234567',
            },
            roles: [{ code: RoleEnum.MESERO }],
          },
        ]),
      };
      userRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.findAllStaff(RoleEnum.MESERO, true);
      expect(result).toHaveLength(1);
      expect(result[0].staffId).toBe('M000001');
      expect(result[0].roles).toContain(RoleEnum.MESERO);
    });

    it('[SEC #14] no incluye contraseñas temporales en el listado', async () => {
      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          {
            id: 'usr-2',
            isActive: true,
            passwordStatus: PasswordStatus.TEMPORARY,
            temporaryPassword: 'Fmat-ABCD-EFGH', // dato heredado de la columna antigua
            createdAt: new Date(),
            staffProfile: { staffId: 'M000002', firstName: 'Ana', lastName: 'Ruiz' },
            roles: [{ code: RoleEnum.MESERO }],
          },
        ]),
      };
      userRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.findAllStaff();
      expect(result[0]).not.toHaveProperty('temporaryPassword');
      expect(JSON.stringify(result)).not.toContain('Fmat-ABCD-EFGH');
    });
  });

  describe('findStaffById', () => {
    it('debería retornar el perfil del miembro del personal encontrado', async () => {
      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({
          id: 'usr-1',
          isActive: true,
          passwordStatus: PasswordStatus.ACTIVE,
          createdAt: new Date(),
          staffProfile: {
            staffId: 'M000001',
            firstName: 'Juan',
            lastName: 'Pérez',
            phone: '9991234567',
          },
          roles: [{ code: RoleEnum.MESERO }],
        }),
      };
      userRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.findStaffById('M000001');
      expect(result.staffId).toBe('M000001');
      expect(result.firstName).toBe('Juan');
    });

    it('debería lanzar NotFoundException si el empleado no existe', async () => {
      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      };
      userRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      await expect(service.findStaffById('M999999')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateRoles', () => {
    it('debería impedir asignar el rol ADMINISTRADOR', async () => {
      await expect(
        service.updateRoles('usr-1', {
          roles: [RoleEnum.ADMINISTRADOR],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('debería actualizar roles y publicar evento a RabbitMQ', async () => {
      const user = {
        id: 'usr-1',
        isActive: true,
        staffProfile: { staffId: 'M000001', firstName: 'Juan', lastName: 'Pérez' },
        roles: [{ code: RoleEnum.MESERO }],
      };
      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(user),
      };
      userRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      roleRepo.find.mockResolvedValue([
        { code: RoleEnum.MESERO },
        { code: RoleEnum.HOST },
      ]);

      const result = await service.updateRoles('usr-1', {
        roles: [RoleEnum.MESERO, RoleEnum.HOST],
      });

      expect(result.roles).toEqual([RoleEnum.MESERO, RoleEnum.HOST]);
      // [SEC #15] los tokens con los roles anteriores dejan de valer
      expect(userRepo.save).toHaveBeenCalledWith(expect.objectContaining({ tokenVersion: 1 }));
      expect(eventsService.publishStaffRolesUpdated).toHaveBeenCalledWith(
        expect.objectContaining({
          staffId: 'M000001',
          roles: [RoleEnum.MESERO, RoleEnum.HOST],
        }),
      );
    });
  });

  describe('updateStatus', () => {
    it('debería revocar sesiones si el empleado es desactivado', async () => {
      const user = {
        id: 'usr-1',
        isActive: true,
        staffProfile: { staffId: 'M000001', firstName: 'Juan', lastName: 'Pérez' },
        roles: [{ code: RoleEnum.MESERO }],
      };
      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(user),
      };
      userRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.updateStatus('usr-1', {
        isActive: false,
      });

      expect(result.isActive).toBe(false);
      // [SEC #15] también se invalidan los access tokens vigentes
      expect(userRepo.save).toHaveBeenCalledWith(expect.objectContaining({ tokenVersion: 1 }));
      expect(refreshTokenRepo.update).toHaveBeenCalledWith(
        { userId: 'usr-1', isRevoked: false },
        { isRevoked: true },
      );
      expect(eventsService.publishStaffStatusChanged).toHaveBeenCalledWith(
        expect.objectContaining({
          staffId: 'M000001',
          isActive: false,
        }),
      );
    });
  });

  describe('resetPassword', () => {
    it('debería asignar una nueva contraseña temporal y revocar sesiones activas', async () => {
      const user = {
        id: 'usr-1',
        passwordHash: 'old-hash',
        passwordStatus: PasswordStatus.ACTIVE,
        passwordResetRequested: true,
        staffProfile: { staffId: 'M000001' },
      };
      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(user),
      };
      userRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.resetPassword('usr-1', {});

      expect(result).toHaveProperty('temporaryPassword');
      expect(user.passwordStatus).toBe(PasswordStatus.TEMPORARY);
      expect(user.passwordResetRequested).toBe(false);
      expect(refreshTokenRepo.update).toHaveBeenCalled();
      // [SEC #14] la contraseña temporal no se guarda en claro
      expect(user).not.toHaveProperty('temporaryPassword');
      expect(await bcrypt.compare(result.temporaryPassword, user.passwordHash)).toBe(true);
      // [SEC #15] las sesiones con la contraseña anterior dejan de valer
      expect((user as any).tokenVersion).toBe(1);
    });

    it('[#23] registra en la auditoría qué administrador atendió el reseteo', async () => {
      const user = {
        id: 'usr-1',
        passwordHash: 'old-hash',
        passwordStatus: PasswordStatus.ACTIVE,
        passwordResetRequested: true,
        staffProfile: { staffId: 'M000001' },
      };
      userRepo.createQueryBuilder.mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(user),
      });

      const result = await service.resetPassword('usr-1', {}, 'adm-1');

      const entry = auditLogRepo.save.mock.calls[0][0];
      expect(entry.userId).toBe('adm-1');
      expect(entry.action).toBe('PASSWORD_RESET_BY_ADMIN');
      expect(JSON.parse(entry.details)).toEqual({
        targetUserId: 'usr-1',
        staffId: 'M000001',
        hadPendingRequest: true,
      });
      // La contraseña temporal nunca va a la auditoría.
      expect(entry.details).not.toContain(result.temporaryPassword);
    });
  });

  describe('[SEC] contraseñas temporales', () => {
    const buildQb = (user: any) => ({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(user),
    });

    it('debería generar contraseñas con formato Fmat-XXXX-XXXX y 8 caracteres aleatorios', async () => {
      const user = { id: 'usr-1', staffProfile: { staffId: 'M000001' } };
      userRepo.createQueryBuilder.mockReturnValue(buildQb(user));

      const result = await service.resetPassword('usr-1', {});

      expect(result.temporaryPassword).toMatch(/^Fmat-[A-HJ-NP-Z2-9!#]{4}-[A-HJ-NP-Z2-9!#]{4}$/);
    });

    it('no debería repetir contraseñas temporales (ya no son solo 9,000 combinaciones)', async () => {
      const generated = new Set<string>();
      for (let i = 0; i < 50; i++) {
        const user = { id: `usr-${i}`, staffProfile: { staffId: 'M000001' } };
        userRepo.createQueryBuilder.mockReturnValue(buildQb(user));
        const result = await service.resetPassword(`usr-${i}`, {});
        generated.add(result.temporaryPassword);
      }
      expect(generated.size).toBe(50);
    });
  });

  describe('updateStaff', () => {
    it('debería actualizar información del empleado correctamente', async () => {
      const user = {
        id: 'usr-1',
        staffProfile: { staffId: 'M000001', firstName: 'Juan', lastName: 'Pérez' },
        roles: [{ code: RoleEnum.MESERO }],
        isActive: true,
      };
      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(user),
      };
      userRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      roleRepo.find.mockResolvedValue([{ code: RoleEnum.HOST }]);

      const result = await service.updateStaff('usr-1', {
        firstName: 'Juan Carlos',
        lastName: 'Pérez Gómez',
        roles: [RoleEnum.HOST],
      });

      expect(user.staffProfile.firstName).toBe('Juan Carlos');
      expect(user.staffProfile.lastName).toBe('Pérez Gómez');
      expect(staffProfileRepo.save).toHaveBeenCalled();
      expect(userRepo.save).toHaveBeenCalled();
      expect(result.staffId).toBe('M000001');
    });
  });

  describe('deleteStaff', () => {
    it('debería eliminar al colaborador y sus dependencias', async () => {
      const user = {
        id: 'usr-1',
        staffProfile: { staffId: 'M000001' },
      };
      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(user),
      };
      userRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.deleteStaff('usr-1');

      expect(result.message).toContain('eliminado definitivamente');
      expect(refreshTokenRepo.delete).toHaveBeenCalledWith({ userId: 'usr-1' });
      expect(staffProfileRepo.delete).toHaveBeenCalledWith({ userId: 'usr-1' });
      expect(userRepo.delete).toHaveBeenCalledWith({ id: 'usr-1' });
      expect(eventsService.publishStaffDeleted).toHaveBeenCalledWith({
        userId: 'usr-1',
        staffId: 'M000001',
      });
    });
  });
});
