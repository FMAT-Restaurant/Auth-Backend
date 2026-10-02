import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { RolesService } from './roles.service';
import { Role, RoleEnum } from '../database/entities/role.entity';

describe('RolesService', () => {
  let service: RolesService;
  let roleRepo: any;

  beforeEach(async () => {
    roleRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((entity) => entity),
      save: jest.fn((entity) => Promise.resolve(entity)),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesService,
        {
          provide: getRepositoryToken(Role),
          useValue: roleRepo,
        },
      ],
    }).compile();

    service = module.get<RolesService>(RolesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getPermissionsCatalog', () => {
    it('debería devolver el catálogo de permisos estructurado por microservicio', () => {
      const catalog = service.getPermissionsCatalog();
      expect(catalog).toBeInstanceOf(Array);
      expect(catalog.length).toBeGreaterThan(0);
      expect(catalog[0]).toHaveProperty('serviceKey');
      expect(catalog[0]).toHaveProperty('permissions');
    });
  });

  describe('createRole', () => {
    it('debería crear un rol personalizado exitosamente', async () => {
      roleRepo.findOne.mockResolvedValue(null);

      const result = await service.createRole({
        name: 'Barista',
        description: 'Preparación de bebidas y café',
        permissions: ['orders:view', 'menu:view'],
      });

      expect(result.code).toBe('ROL_BARISTA');
      expect(result.name).toBe('Barista');
      expect(result.isSystemRole).toBe(false);
      expect(roleRepo.save).toHaveBeenCalled();
    });

    it('debería rechazar si el código de rol ya existe', async () => {
      roleRepo.findOne.mockResolvedValue({ code: 'ROL_BARISTA' });

      await expect(
        service.createRole({
          name: 'Barista',
          code: 'ROL_BARISTA',
          permissions: ['orders:view'],
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('updateRole', () => {
    it('debería permitir actualizar un rol personalizado', async () => {
      const customRole = {
        code: 'ROL_BARISTA',
        name: 'Barista',
        description: 'Desc',
        permissions: ['orders:view'],
        isSystemRole: false,
      };
      roleRepo.findOne.mockResolvedValue(customRole);

      const result = await service.updateRole('ROL_BARISTA', {
        name: 'Barista Principal',
        permissions: ['orders:view', 'inventory:view'],
      });

      expect(result.name).toBe('Barista Principal');
      expect(result.permissions).toContain('inventory:view');
      expect(roleRepo.save).toHaveBeenCalled();
    });

    it('debería impedir renombrar un rol protegido del sistema', async () => {
      const systemRole = {
        code: RoleEnum.ADMINISTRADOR,
        name: 'Administrador General',
        isSystemRole: true,
      };
      roleRepo.findOne.mockResolvedValue(systemRole);

      await expect(
        service.updateRole(RoleEnum.ADMINISTRADOR, {
          name: 'Nuevo Nombre Admin',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('deleteRole', () => {
    it('debería permitir eliminar un rol personalizado', async () => {
      const customRole = {
        code: 'ROL_BARISTA',
        name: 'Barista',
        isSystemRole: false,
      };
      roleRepo.findOne.mockResolvedValue(customRole);

      const result = await service.deleteRole('ROL_BARISTA');
      expect(result.code).toBe('ROL_BARISTA');
      expect(roleRepo.delete).toHaveBeenCalledWith({ code: 'ROL_BARISTA' });
    });

    it('debería rechazar eliminar un rol del sistema', async () => {
      const systemRole = {
        code: RoleEnum.MESERO,
        name: 'Mesero',
        isSystemRole: true,
      };
      roleRepo.findOne.mockResolvedValue(systemRole);

      await expect(service.deleteRole(RoleEnum.MESERO)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
