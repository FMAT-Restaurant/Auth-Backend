import { Test, TestingModule } from '@nestjs/testing';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';

describe('RolesController', () => {
  let controller: RolesController;
  let rolesService: Record<string, jest.Mock>;

  beforeEach(async () => {
    rolesService = {
      getPermissionsCatalog: jest.fn().mockReturnValue([{ serviceKey: 'orders' }]),
      findAllRoles: jest.fn().mockResolvedValue([{ code: 'MESERO' }]),
      findRoleByCode: jest.fn().mockResolvedValue({ code: 'MESERO', name: 'Mesero' }),
      createRole: jest.fn().mockResolvedValue({ code: 'ROL_CAJERO', name: 'Cajero' }),
      updateRole: jest.fn().mockResolvedValue({ code: 'ROL_CAJERO', name: 'Cajero Turno' }),
      deleteRole: jest.fn().mockResolvedValue({ message: 'Eliminado', code: 'ROL_CAJERO' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RolesController],
      providers: [{ provide: RolesService, useValue: rolesService }],
    }).compile();

    controller = module.get<RolesController>(RolesController);
  });

  it('debería retornar el catálogo de permisos', () => {
    expect(controller.getPermissionsCatalog()).toEqual([{ serviceKey: 'orders' }]);
    expect(rolesService.getPermissionsCatalog).toHaveBeenCalled();
  });

  it('debería listar todos los roles', async () => {
    await expect(controller.findAllRoles()).resolves.toEqual([{ code: 'MESERO' }]);
    expect(rolesService.findAllRoles).toHaveBeenCalled();
  });

  it('debería obtener un rol por su código', async () => {
    await expect(controller.findRoleByCode('MESERO')).resolves.toEqual({
      code: 'MESERO',
      name: 'Mesero',
    });
    expect(rolesService.findRoleByCode).toHaveBeenCalledWith('MESERO');
  });

  it('debería crear un nuevo rol', async () => {
    const dto = { name: 'Cajero', permissions: ['billing:invoices:create'] };
    await expect(controller.createRole(dto)).resolves.toEqual({
      code: 'ROL_CAJERO',
      name: 'Cajero',
    });
    expect(rolesService.createRole).toHaveBeenCalledWith(dto);
  });

  it('debería actualizar un rol existente', async () => {
    const dto = { name: 'Cajero Turno' };
    await expect(controller.updateRole('ROL_CAJERO', dto)).resolves.toEqual({
      code: 'ROL_CAJERO',
      name: 'Cajero Turno',
    });
    expect(rolesService.updateRole).toHaveBeenCalledWith('ROL_CAJERO', dto);
  });

  it('debería eliminar un rol personalizado', async () => {
    await expect(controller.deleteRole('ROL_CAJERO')).resolves.toEqual({
      message: 'Eliminado',
      code: 'ROL_CAJERO',
    });
    expect(rolesService.deleteRole).toHaveBeenCalledWith('ROL_CAJERO');
  });
});
