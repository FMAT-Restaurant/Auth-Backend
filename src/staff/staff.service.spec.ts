import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { StaffService } from './staff.service';
import { User, PasswordStatus } from '../database/entities/user.entity';
import { StaffProfile } from '../database/entities/staff-profile.entity';
import { Role, RoleEnum } from '../database/entities/role.entity';
import { RefreshToken } from '../database/entities/refresh-token.entity';
import { EventsService } from '../events/events.service';

describe('StaffService', () => {
  let service: StaffService;
  let userRepo: any;
  let staffProfileRepo: any;
  let roleRepo: any;
  let refreshTokenRepo: any;
  let eventsService: any;

  beforeEach(async () => {
    userRepo = {
      create: jest.fn((entity) => ({ id: 'usr-staff-1', ...entity })),
      save: jest.fn((entity) => Promise.resolve({ id: 'usr-staff-1', ...entity })),
      createQueryBuilder: jest.fn(),
    };

    staffProfileRepo = {
      create: jest.fn((entity) => ({ id: 'profile-1', ...entity })),
      save: jest.fn((entity) => Promise.resolve({ id: 'profile-1', ...entity })),
      count: jest.fn().mockResolvedValue(0),
      findOne: jest.fn().mockResolvedValue(null),
    };

    roleRepo = {
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((entity) => entity),
      save: jest.fn((entity) => Promise.resolve(entity)),
    };

    refreshTokenRepo = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    eventsService = {
      publishStaffCreated: jest.fn().mockResolvedValue(undefined),
      publishStaffRolesUpdated: jest.fn().mockResolvedValue(undefined),
      publishStaffStatusChanged: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StaffService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(StaffProfile), useValue: staffProfileRepo },
        { provide: getRepositoryToken(Role), useValue: roleRepo },
        { provide: getRepositoryToken(RefreshToken), useValue: refreshTokenRepo },
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
      expect(refreshTokenRepo.update).toHaveBeenCalled();
    });
  });
});
