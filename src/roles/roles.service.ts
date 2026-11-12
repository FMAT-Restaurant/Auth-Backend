import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role, RoleEnum } from '../database/entities/role.entity';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { SYSTEM_PERMISSIONS_CATALOG } from './catalog/permissions-catalog';

@Injectable()
export class RolesService implements OnModuleInit {
  constructor(
    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,
  ) {}

  async onModuleInit() {
    await this.seedDefaultRoles();
  }

  async seedDefaultRoles(): Promise<void> {
    const defaultRoles: {
      code: string;
      name: string;
      description: string;
      permissions: string[];
      isAssignable: boolean;
      isSystemRole: boolean;
    }[] = [
      {
        code: RoleEnum.ADMINISTRADOR,
        name: 'Administrador General',
        description: 'Propietario / Gerente con control total de la sucursal',
        permissions: ['*'],
        isAssignable: false,
        isSystemRole: true,
      },
      {
        code: RoleEnum.MESERO,
        name: 'Mesero / Órdenes',
        description: 'Captura, consulta y gestión de órdenes de comensales',
        permissions: [
          'orders:orders:view',
          'orders:orders:create',
          'orders:orders:update',
          'orders:orders:confirm',
          'orders:orders:cancel',
          'orders:orders:transfer',
          'orders:items:redo',
          'orders:orders:request_bill',
        ],
        isAssignable: true,
        isSystemRole: true,
      },
      {
        code: RoleEnum.CHEF_MASTER,
        name: 'Chef / Cocina',
        description: 'Control de pantalla KDS, preparación de comandas y estado de platillos',
        permissions: [
          'kitchen:queues:view',
          'kitchen:orders:start_preparation',
          'kitchen:items:ready',
          'kitchen:orders:ready',
          'kitchen:items:reject',
          'kitchen:items:cancel',
          'kitchen:orders:void_error',
          'orders:orders:view',
        ],
        isAssignable: true,
        isSystemRole: true,
      },
      {
        code: RoleEnum.GESTOR_MENU,
        name: 'Gestor de Menú',
        description: 'Administración del catálogo de platillos, categorías, recetas y promociones',
        permissions: [
          'menu:entries:view',
          'menu:entries:manage',
          'menu:categories:view',
          'menu:categories:manage',
          'menu:recipes:view',
          'menu:recipes:manage',
          'menu:offers:view',
          'menu:offers:manage',
        ],
        isAssignable: true,
        isSystemRole: true,
      },
      {
        code: RoleEnum.ALMACENISTA,
        name: 'Almacenista / Bodega',
        description: 'Gestión de existencias, compras, inventario e insumos',
        permissions: [
          'inventory:items:read',
          'inventory:items:write',
          'inventory:batches:read',
          'inventory:batches:write',
          'inventory:suppliers:read',
          'inventory:suppliers:write',
          'inventory:recipes:read',
          'inventory:reservations:read',
          'inventory:movements:read',
        ],
        isAssignable: true,
        isSystemRole: true,
      },
      {
        code: RoleEnum.HOST,
        name: 'Host / Recepción',
        description: 'Recepción de comensales, gestión de mesas, reservas y lista de espera',
        permissions: [
          'sala:tables:view',
          'sala:tables:occupy',
          'sala:tables:update_status',
          'sala:tables:assign_waiter',
          'sala:assignments:view',
          'sala:table_unions:view',
          'sala:table_unions:create',
          'sala:table_unions:release',
          'sala:reservations:view',
          'sala:reservations:create',
          'sala:reservations:update',
          'sala:reservations:cancel',
          'sala:reservations:mark_no_show',
          'sala:waitlist_entries:view',
          'sala:waitlist_entries:create',
          'sala:waitlist_entries:update_status',
        ],
        isAssignable: true,
        isSystemRole: true,
      },
      {
        code: RoleEnum.CAJERO,
        name: 'Cajero / Facturación',
        description: 'Cobro de cuentas, emisión de comprobantes y reportes de caja',
        permissions: [
          'billing:invoices:create',
          'billing:reports:view',
        ],
        isAssignable: true,
        isSystemRole: true,
      },
    ];

    for (const def of defaultRoles) {
      const existing = await this.roleRepo.findOne({ where: { code: def.code } });
      if (!existing) {
        const role = this.roleRepo.create(def);
        await this.roleRepo.save(role);
      } else {
        existing.permissions = def.permissions;
        existing.isSystemRole = true;
        await this.roleRepo.save(existing);
      }
    }
  }

  getPermissionsCatalog() {
    return SYSTEM_PERMISSIONS_CATALOG;
  }

  async findAllRoles(): Promise<Role[]> {
    return this.roleRepo.find({
      order: { isSystemRole: 'DESC', name: 'ASC' },
    });
  }

  async findRoleByCode(code: string): Promise<Role> {
    const role = await this.roleRepo.findOne({
      where: { code: code.toUpperCase().trim() },
    });
    if (!role) {
      throw new NotFoundException(`El rol con código '${code}' no existe`);
    }
    return role;
  }

  async createRole(dto: CreateRoleDto): Promise<Role> {
    let roleCode = dto.code
      ? dto.code.toUpperCase().trim()
      : `ROL_${dto.name
          .trim()
          .toUpperCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .split(/[^A-Z0-9]+/)
          .filter(Boolean)
          .join('_')}`;

    if (
      !roleCode.startsWith('ROL_') &&
      !['HOST', 'ALMACENISTA', 'GESTOR_MENU', 'MESERO', 'CHEF_MASTER', 'CAJERO'].includes(roleCode)
    ) {
      roleCode = `ROL_${roleCode}`;
    }

    const existing = await this.roleRepo.findOne({ where: { code: roleCode } });
    if (existing) {
      throw new ConflictException(
        `Ya existe un rol registrado con el código '${roleCode}' o nombre similar`,
      );
    }

    const role = this.roleRepo.create({
      code: roleCode,
      name: dto.name.trim(),
      description: dto.description?.trim() || `Rol personalizado de ${dto.name.trim()}`,
      permissions: dto.permissions || [],
      isAssignable: true,
      isSystemRole: false,
    });

    return this.roleRepo.save(role);
  }

  async updateRole(code: string, dto: UpdateRoleDto): Promise<Role> {
    const role = await this.findRoleByCode(code);

    if (dto.name !== undefined) {
      if (role.isSystemRole) {
        throw new BadRequestException(
          'No se puede renombrar un rol protegido del sistema',
        );
      }
      role.name = dto.name.trim();
    }

    if (dto.description !== undefined) {
      role.description = dto.description.trim();
    }

    if (dto.permissions !== undefined) {
      role.permissions = dto.permissions;
    }

    return this.roleRepo.save(role);
  }

  async deleteRole(code: string): Promise<{ message: string; code: string }> {
    const role = await this.findRoleByCode(code);

    if (role.isSystemRole) {
      throw new BadRequestException(
        `El rol '${role.name}' (${role.code}) es un rol base del sistema y no puede eliminarse`,
      );
    }

    await this.roleRepo.delete({ code: role.code });

    return {
      message: `Rol '${role.name}' eliminado exitosamente`,
      code: role.code,
    };
  }
}
