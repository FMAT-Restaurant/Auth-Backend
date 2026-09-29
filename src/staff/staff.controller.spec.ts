import { Test, TestingModule } from '@nestjs/testing';
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
      const result = await controller.createStaff('rest-1', dto);
      expect(staffService.createStaff).toHaveBeenCalledWith('rest-1', dto);
      expect(result).toHaveProperty('staffId', 'M000001');
    });
  });

  describe('findAllStaff', () => {
    it('debería delegar el listado de personal con filtros', async () => {
      const result = await controller.findAllStaff('rest-1', RoleEnum.MESERO, 'true');
      expect(staffService.findAllStaff).toHaveBeenCalledWith('rest-1', RoleEnum.MESERO, true);
      expect(result).toHaveLength(1);
    });

    it('debería manejar filtros indefinidos adecuadamente', async () => {
      await controller.findAllStaff('rest-1', undefined, undefined);
      expect(staffService.findAllStaff).toHaveBeenCalledWith('rest-1', undefined, undefined);
    });
  });

  describe('findStaffById', () => {
    it('debería delegar la consulta individual a staffService.findStaffById', async () => {
      const result = await controller.findStaffById('rest-1', 'M000001');
      expect(staffService.findStaffById).toHaveBeenCalledWith('rest-1', 'M000001');
      expect(result).toHaveProperty('staffId', 'M000001');
    });
  });

  describe('updateRoles', () => {
    it('debería delegar la actualización de roles a staffService.updateRoles', async () => {
      const dto = { roles: [RoleEnum.MESERO, RoleEnum.HOST] };
      const result = await controller.updateRoles('rest-1', 'M000001', dto);
      expect(staffService.updateRoles).toHaveBeenCalledWith('rest-1', 'M000001', dto);
      expect(result.roles).toContain(RoleEnum.HOST);
    });
  });

  describe('updateStatus', () => {
    it('debería delegar el cambio de estado a staffService.updateStatus', async () => {
      const dto = { isActive: false };
      const result = await controller.updateStatus('rest-1', 'M000001', dto);
      expect(staffService.updateStatus).toHaveBeenCalledWith('rest-1', 'M000001', dto);
      expect(result.isActive).toBe(false);
    });
  });

  describe('resetPassword', () => {
    it('debería delegar el reseteo de contraseña a staffService.resetPassword', async () => {
      const dto = {};
      const result = await controller.resetPassword('rest-1', 'M000001', dto);
      expect(staffService.resetPassword).toHaveBeenCalledWith('rest-1', 'M000001', dto);
      expect(result).toHaveProperty('temporaryPassword');
    });
  });
});
