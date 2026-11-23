import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';
import { RoleEnum } from '../database/entities/role.entity';

describe('StaffController', () => {
  let controller: StaffController;
  let staffService: any;

  beforeEach(async () => {
    staffService = {
      createStaff: jest.fn().mockResolvedValue({
        message: 'Personal creado',
        staffId: 'M000001',
        temporaryPassword: 'TempPassword123!',
      }),
      findAllStaff: jest.fn().mockResolvedValue([
        {
          id: 'usr-1',
          staffId: 'M000001',
          firstName: 'Juan',
          lastName: 'Pérez',
          roles: [RoleEnum.MESERO],
          isActive: true,
        },
      ]),
      findStaffById: jest.fn().mockResolvedValue({
        id: 'usr-1',
        staffId: 'M000001',
        firstName: 'Juan',
        lastName: 'Pérez',
        roles: [RoleEnum.MESERO],
        isActive: true,
      }),
      updateRoles: jest.fn().mockResolvedValue({
        message: 'Roles actualizados',
        staffId: 'M000001',
        roles: [RoleEnum.MESERO, RoleEnum.HOST],
      }),
      updateStatus: jest.fn().mockResolvedValue({
        message: 'Personal desactivado',
        staffId: 'M000001',
        isActive: false,
      }),
      resetPassword: jest.fn().mockResolvedValue({
        message: 'Contraseña restablecida',
        staffId: 'M000001',
        temporaryPassword: 'NewTempPassword123!',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StaffController],
      providers: [
        {
          provide: StaffService,
          useValue: staffService,
        },
      ],
    }).compile();

    controller = module.get<StaffController>(StaffController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createStaff', () => {
    it('debería delegar la creación de personal a staffService.createStaff', async () => {
      const dto = {
        firstName: 'Juan',
        lastName: 'Pérez',
        phone: '9991234567',
        roles: [RoleEnum.MESERO],
      };
      const result = await controller.createStaff(dto);
      expect(staffService.createStaff).toHaveBeenCalledWith(dto);
      expect(result).toHaveProperty('staffId', 'M000001');
    });
  });

  describe('findAllStaff', () => {
    it('debería delegar el listado completo cuando consulta ADMINISTRADOR', async () => {
      const result = await controller.findAllStaff(
        RoleEnum.MESERO,
        'true',
        undefined,
        [RoleEnum.ADMINISTRADOR],
      );
      expect(staffService.findAllStaff).toHaveBeenCalledWith(
        RoleEnum.MESERO,
        true,
        undefined,
        true,
      );
      expect(result).toHaveLength(1);
    });

    it('debería manejar filtros indefinidos adecuadamente para ADMINISTRADOR', async () => {
      await controller.findAllStaff(undefined, undefined, undefined, [RoleEnum.ADMINISTRADOR]);
      expect(staffService.findAllStaff).toHaveBeenCalledWith(
        undefined,
        undefined,
        undefined,
        true,
      );
    });

    it('[#23] puede filtrar solo las solicitudes de reseteo pendientes cuando es ADMINISTRADOR', async () => {
      await controller.findAllStaff(undefined, undefined, 'true', [RoleEnum.ADMINISTRADOR]);
      expect(staffService.findAllStaff).toHaveBeenCalledWith(undefined, undefined, true, true);
    });

    it('debería omitir passwordResetRequested y pasar isAdmin=false para roles operativos (HOST / ROL_CAPITAN)', async () => {
      await controller.findAllStaff(RoleEnum.MESERO, 'true', 'true', [RoleEnum.HOST]);
      expect(staffService.findAllStaff).toHaveBeenCalledWith(
        RoleEnum.MESERO,
        true,
        undefined,
        false,
      );
    });

    // #36 (ERS-GAP-07): el query booleano isActive debe validarse.
    it('[#36] interpreta isActive="false" como booleano false', async () => {
      await controller.findAllStaff(undefined, 'false', undefined, [RoleEnum.ADMINISTRADOR]);
      expect(staffService.findAllStaff).toHaveBeenCalledWith(undefined, false, undefined, true);
    });

    it('[#36] rechaza un isActive que no sea true/false con 400', async () => {
      await expect(
        controller.findAllStaff(undefined, 'sí', undefined, [RoleEnum.ADMINISTRADOR]),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findStaffById', () => {
    it('debería delegar la consulta individual a staffService.findStaffById', async () => {
      const result = await controller.findStaffById('M000001');
      expect(staffService.findStaffById).toHaveBeenCalledWith('M000001');
      expect(result).toHaveProperty('staffId', 'M000001');
    });
  });

  describe('updateRoles', () => {
    it('debería delegar la actualización de roles a staffService.updateRoles', async () => {
      const dto = { roles: [RoleEnum.MESERO, RoleEnum.HOST] };
      const result = await controller.updateRoles('M000001', dto);
      expect(staffService.updateRoles).toHaveBeenCalledWith('M000001', dto);
      expect(result.roles).toContain(RoleEnum.HOST);
    });
  });

  describe('updateStatus', () => {
    it('debería delegar el cambio de estado a staffService.updateStatus', async () => {
      const dto = { isActive: false };
      const result = await controller.updateStatus('M000001', dto);
      expect(staffService.updateStatus).toHaveBeenCalledWith('M000001', dto);
      expect(result.isActive).toBe(false);
    });
  });

  describe('resetPassword', () => {
    it('debería delegar el reseteo de contraseña a staffService.resetPassword', async () => {
      const dto = {};
      const result = await controller.resetPassword('M000001', 'adm-1', dto);
      expect(staffService.resetPassword).toHaveBeenCalledWith('M000001', dto, 'adm-1');
      expect(result).toHaveProperty('temporaryPassword');
    });
  });

  describe('updateStaff', () => {
    it('debería delegar la actualización del colaborador a staffService.updateStaff', async () => {
      const dto = { firstName: 'Carlos', lastName: 'Gómez' };
      staffService.updateStaff = jest.fn().mockResolvedValue({ id: 'usr-1', staffId: 'M000001' });
      const result = await controller.updateStaff('M000001', dto);
      expect(staffService.updateStaff).toHaveBeenCalledWith('M000001', dto);
      expect(result).toHaveProperty('staffId', 'M000001');
    });
  });

  describe('deleteStaff', () => {
    it('debería delegar la eliminación a staffService.deleteStaff', async () => {
      staffService.deleteStaff = jest.fn().mockResolvedValue({
        message: 'Colaborador eliminado definitivamente del sistema',
        staffId: 'M000001',
      });
      const result = await controller.deleteStaff('M000001');
      expect(staffService.deleteStaff).toHaveBeenCalledWith('M000001');
      expect(result.message).toContain('eliminado definitivamente');
    });
  });
});
