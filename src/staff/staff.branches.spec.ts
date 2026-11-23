/**
 * Ramas de StaffService que no cubrían las demás pruebas (#35): 404 por
 * empleado inexistente, búsqueda por UUID o Staff ID, prefijos de Staff ID y
 * colisiones al generarlo, y el filtro de solicitudes de reseteo.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { StaffService } from './staff.service';
import { User } from '../database/entities/user.entity';
import { StaffProfile } from '../database/entities/staff-profile.entity';
import { Role, RoleEnum } from '../database/entities/role.entity';
import { RefreshToken } from '../database/entities/refresh-token.entity';
import { AuditLog } from '../database/entities/audit-log.entity';
import { EventsService } from '../events/events.service';

type Mock = jest.Mock;

describe('StaffService: ramas adicionales', () => {
  let service: StaffService;
  let qb: Record<string, Mock>;
  let roleRepo: Record<string, Mock>;
  let staffProfileRepo: Record<string, Mock>;

  beforeEach(async () => {
    qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
      getMany: jest.fn().mockResolvedValue([]),
    };
    roleRepo = { find: jest.fn().mockResolvedValue([]) };
    staffProfileRepo = {
      create: jest.fn((e) => e),
      save: jest.fn((e) => Promise.resolve(e)),
      count: jest.fn().mockResolvedValue(0),
      findOne: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StaffService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            createQueryBuilder: jest.fn(() => qb),
            create: jest.fn((e) => ({ id: 'usr-new', ...e })),
            save: jest.fn((e) => Promise.resolve(e)),
          },
        },
        { provide: getRepositoryToken(StaffProfile), useValue: staffProfileRepo },
        { provide: getRepositoryToken(Role), useValue: roleRepo },
        { provide: getRepositoryToken(RefreshToken), useValue: { update: jest.fn() } },
        {
          provide: getRepositoryToken(AuditLog),
          useValue: { create: jest.fn((e) => e), save: jest.fn().mockResolvedValue({}) },
        },
        {
          provide: EventsService,
          useValue: { publishStaffCreated: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get(StaffService);
  });

  it.each([
    ['findStaffById', (s: StaffService) => s.findStaffById('M000404')],
    ['updateRoles', (s: StaffService) => s.updateRoles('M000404', { roles: [RoleEnum.HOST] })],
    ['updateStatus', (s: StaffService) => s.updateStatus('M000404', { isActive: false })],
    ['updateStaff', (s: StaffService) => s.updateStaff('M000404', { firstName: 'X' })],
    ['deleteStaff', (s: StaffService) => s.deleteStaff('M000404')],
    ['resetPassword', (s: StaffService) => s.resetPassword('M000404', {})],
  ] as Array<[string, (s: StaffService) => Promise<unknown>]>)(
    '%s responde 404 si el empleado no existe',
    async (_name, call) => {
      roleRepo.find.mockResolvedValue([{ code: RoleEnum.HOST, isAssignable: true }]);
      await expect(call(service)).rejects.toThrow(NotFoundException);
    },
  );

  it('busca por UUID o por Staff ID (sin importar mayúsculas)', async () => {
    await service.findStaffById('  59aaa30e-4075-436e-9c61-b35a49fadbc3 ').catch(() => undefined);
    expect(qb.andWhere).toHaveBeenCalledWith('user.id = :id', {
      id: '59aaa30e-4075-436e-9c61-b35a49fadbc3',
    });
    await service.findStaffById('m000001').catch(() => undefined);
    expect(qb.andWhere).toHaveBeenCalledWith('UPPER(profile.staffId) = :id', { id: 'M000001' });
  });

  it('el filtro de reseteos pendientes solo aplica para el administrador', async () => {
    await service.findAllStaff(undefined, undefined, true, false);
    expect(qb.andWhere).not.toHaveBeenCalledWith(
      expect.stringContaining('passwordResetRequested'),
      expect.anything(),
    );
    await service.findAllStaff(undefined, undefined, true, true);
    expect(qb.andWhere).toHaveBeenCalledWith(
      'user.passwordResetRequested = :passwordResetRequested',
      { passwordResetRequested: true },
    );
  });

  it.each([
    [RoleEnum.ALMACENISTA, 'A'],
    [RoleEnum.GESTOR_MENU, 'G'],
    [RoleEnum.COCINERO, 'C'],
    [RoleEnum.CAJERO, 'J'],
    ['ROL_BARISTA', 'B'],
    ['ROL_9X', 'E'],
  ])('el rol %s genera Staff ID con prefijo %s', async (code, prefix) => {
    roleRepo.find.mockResolvedValue([{ code, isAssignable: true }]);
    const result = await service.createStaff({ firstName: 'A', lastName: 'B', roles: [code] });
    expect(result.staffId).toMatch(new RegExp(`^${prefix}\\d{6}$`));
  });

  it('si el siguiente Staff ID ya existe, prueba con el siguiente número', async () => {
    roleRepo.find.mockResolvedValue([{ code: RoleEnum.MESERO, isAssignable: true }]);
    staffProfileRepo.count.mockResolvedValue(4);
    staffProfileRepo.findOne
      .mockResolvedValueOnce({ staffId: 'M000005' })
      .mockResolvedValueOnce({ staffId: 'M000006' })
      .mockResolvedValue(null);

    const result = await service.createStaff({
      firstName: 'A',
      lastName: 'B',
      roles: [RoleEnum.MESERO],
    });

    expect(result.staffId).toBe('M000007');
  });
});
