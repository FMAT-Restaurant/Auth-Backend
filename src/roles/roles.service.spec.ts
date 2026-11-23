import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { RolesService } from './roles.service';
import { Role, RoleEnum } from '../database/entities/role.entity';
import { AuditLog } from '../database/entities/audit-log.entity';
import { runWithRequestContext } from '../common/audit/request-context';
import type { Request } from 'express';

describe('RolesService', () => {
  let service: RolesService;
  let roleRepo: any;
  let auditLogRepo: { create: jest.Mock; save: jest.Mock };

  beforeEach(async () => {
    auditLogRepo = {
      create: jest.fn((entity) => entity),
      save: jest.fn((entity) => Promise.resolve(entity)),
    };
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
        { provide: getRepositoryToken(AuditLog), useValue: auditLogRepo },
      ],
    }).compile();

    service = module.get<RolesService>(RolesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getPermissionsCatalog & seedDefaultRoles', () => {
    it('debería devolver el catálogo de permisos estructurado por microservicio', () => {
      const catalog = service.getPermissionsCatalog();
      expect(catalog).toBeInstanceOf(Array);
      expect(catalog.length).toBeGreaterThan(0);
      expect(catalog[0]).toHaveProperty('serviceKey');
      expect(catalog[0]).toHaveProperty('permissions');
    });

    it('debería sembrar los roles por defecto en onModuleInit y actualizar los que no tengan permisos', async () => {
      roleRepo.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ code: RoleEnum.MESERO, permissions: [] })
        .mockResolvedValue({ code: RoleEnum.HOST, permissions: ['sala:tables:view'] });

      await service.onModuleInit();
      expect(roleRepo.create).toHaveBeenCalled();
      expect(roleRepo.save).toHaveBeenCalled();
    });

    it('debería listar todos los roles y lanzar error si un código no existe', async () => {
      await expect(service.findAllRoles()).resolves.toEqual([]);
      roleRepo.findOne.mockResolvedValueOnce(null);
      await expect(service.findRoleByCode('INEXISTENTE')).rejects.toThrow();
    });
  });

  describe('createRole', () => {
    it('debería crear un rol personalizado exitosamente', async () => {
      roleRepo.findOne.mockResolvedValue(null);

      const result = await service.createRole({
        name: 'Barista',
        description: 'Preparación de bebidas y café',
        permissions: ['orders:orders:view', 'menu:catalog:read'],
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
          permissions: ['orders:orders:view'],
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('no debería anteponer ROL_ cuando el código pertenece a un rol reservado del sistema', async () => {
      roleRepo.findOne.mockResolvedValue(null);

      const result = await service.createRole({
        name: 'Cajero',
        code: 'CAJERO',
        permissions: ['billing:invoices:create'],
      });

      expect(result.code).toBe('CAJERO');
    });
  });

  describe('updateRole', () => {
    it('debería permitir actualizar un rol personalizado', async () => {
      const customRole = {
        code: 'ROL_BARISTA',
        name: 'Barista',
        description: 'Desc',
        permissions: ['orders:orders:view'],
        isSystemRole: false,
      };
      roleRepo.findOne.mockResolvedValue(customRole);

      const result = await service.updateRole('ROL_BARISTA', {
        name: 'Barista Principal',
        permissions: ['orders:orders:view', 'inventory:items:read'],
      });

      expect(result.name).toBe('Barista Principal');
      expect(result.permissions).toContain('inventory:items:read');
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
    it('[SEC #18] no permite cambiar los permisos del rol ADMINISTRADOR', async () => {
      roleRepo.findOne.mockResolvedValue({
        code: RoleEnum.ADMINISTRADOR,
        name: 'Administrador General',
        permissions: ['*'],
        isSystemRole: true,
      });

      await expect(
        service.updateRole(RoleEnum.ADMINISTRADOR, { permissions: [] }),
      ).rejects.toThrow(BadRequestException);
      expect(roleRepo.save).not.toHaveBeenCalled();
    });

    it('[SEC #18] no permite dar "*" a un rol al actualizarlo', async () => {
      roleRepo.findOne.mockResolvedValue({
        code: 'ROL_BARISTA',
        name: 'Barista',
        permissions: ['orders:orders:view'],
        isSystemRole: false,
      });

      await expect(
        service.updateRole('ROL_BARISTA', { permissions: ['orders:orders:view', '*'] }),
      ).rejects.toThrow(BadRequestException);
      expect(roleRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('[SEC #18] permisos de roles personalizados', () => {
    it('rechaza el permiso "*" al crear un rol', async () => {
      await expect(
        service.createRole({ name: 'Super', permissions: ['*'] }),
      ).rejects.toThrow(BadRequestException);
      expect(roleRepo.save).not.toHaveBeenCalled();
    });

    it('rechaza permisos que no están en el catálogo', async () => {
      await expect(
        service.createRole({ name: 'Raro', permissions: ['orders:orders:view', 'root:all'] }),
      ).rejects.toThrow(/root:all/);
    });

    it('acepta permisos del catálogo y quita duplicados', async () => {
      const role = await service.createRole({
        name: 'Barista',
        permissions: ['orders:orders:view', 'menu:catalog:read', 'orders:orders:view'],
      });
      expect(role.permissions).toEqual(['orders:orders:view', 'menu:catalog:read']);
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

  describe('[#33] auditoría de roles', () => {
    const req = {
      ip: '::ffff:10.0.0.7',
      headers: { 'user-agent': 'Mozilla/5.0 (Pruebas)' },
      user: { userId: 'admin-1' },
    } as unknown as Request;

    it('registra ROLE_CREATED con actor, IP y user-agent', async () => {
      await runWithRequestContext(req, () =>
        service.createRole({ name: 'Barista', permissions: ['orders:orders:view'] }),
      );
      expect(auditLogRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ROLE_CREATED',
          userId: 'admin-1',
          ipAddress: '10.0.0.7',
          userAgent: 'Mozilla/5.0 (Pruebas)',
        }),
      );
      const details = JSON.parse(auditLogRepo.save.mock.calls[0][0].details);
      expect(details).toEqual({ code: 'ROL_BARISTA', permissions: ['orders:orders:view'] });
    });

    it('registra ROLE_UPDATED con los permisos anteriores y nuevos', async () => {
      roleRepo.findOne.mockResolvedValue({
        code: 'ROL_BARISTA',
        name: 'Barista',
        permissions: ['orders:orders:view'],
        isSystemRole: false,
      });
      await runWithRequestContext(req, () =>
        service.updateRole('ROL_BARISTA', { permissions: ['menu:entries:read'] }),
      );
      const entry = auditLogRepo.save.mock.calls[0][0];
      expect(entry.action).toBe('ROLE_UPDATED');
      expect(JSON.parse(entry.details)).toEqual({
        code: 'ROL_BARISTA',
        changedFields: ['permissions'],
        previousPermissions: ['orders:orders:view'],
        permissions: ['menu:entries:read'],
      });
    });

    it('registra ROLE_DELETED y no audita si la operación falla', async () => {
      roleRepo.findOne.mockResolvedValueOnce({ code: RoleEnum.MESERO, name: 'Mesero', isSystemRole: true });
      await expect(service.deleteRole(RoleEnum.MESERO)).rejects.toThrow(BadRequestException);
      expect(auditLogRepo.save).not.toHaveBeenCalled();

      roleRepo.findOne.mockResolvedValueOnce({ code: 'ROL_X', name: 'X', isSystemRole: false });
      await service.deleteRole('ROL_X');
      expect(auditLogRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ROLE_DELETED', userId: null, ipAddress: null }),
      );
    });

    it('un fallo al guardar la auditoría no interrumpe la operación', async () => {
      auditLogRepo.save.mockRejectedValueOnce(new Error('db caída'));
      await expect(
        service.createRole({ name: 'Mixólogo', permissions: ['orders:orders:view'] }),
      ).resolves.toEqual(expect.objectContaining({ code: 'ROL_MIXOLOGO' }));
    });
  });
});
