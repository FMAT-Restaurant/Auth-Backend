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
        name: 'Mesero / Salonero',
        description: 'Atención a comensales, toma de pedidos y visualización de mesas',
        permissions: [
          'orders:view',
          'orders:create',
          'menu:view',
          'sala:tables:view',
        ],
        isAssignable: true,
        isSystemRole: true,
      },
      {
        code: RoleEnum.CHEF_MASTER,
        name: 'Chef Ejecutivo / Cocina',
        description: 'Control de pantalla KDS, preparación de comandas y estado de platillos',
        permissions: [
          'kitchen:kds:view',
          'kitchen:order:start_preparation',
          'kitchen:order:mark_ready',
          'orders:view',
        ],
        isAssignable: true,
        isSystemRole: true,
      },
      {
        code: RoleEnum.ALMACENISTA,
        name: 'Almacenista / Bodega',
        description: 'Gestión de existencias, compras, inventario e insumos',
        permissions: [
          'inventory:view',
          'inventory:ingredients:create',
          'inventory:stock:update_status',
          'inventory:ingredients:delete',
        ],
        isAssignable: true,
        isSystemRole: true,
      },
      {
        code: RoleEnum.HOST,
        name: 'Host / Recepción',
        description: 'Recepción de comensales y distribución en mesas',
        permissions: [
          'sala:tables:view',
          'sala:tables:assign_diner',
          'sala:tables:assign_waiter',
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
      } else if (!existing.permissions || existing.permissions.length === 0) {
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
          .replace(/[^A-Z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '')}`;

    if (!roleCode.startsWith('ROL_') && !['HOST', 'ALMACENISTA', 'MESERO', 'CHEF_MASTER'].includes(roleCode)) {
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
