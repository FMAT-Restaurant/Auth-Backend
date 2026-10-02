import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import * as bcrypt from 'bcrypt';

import { User, UserType, PasswordStatus } from '../database/entities/user.entity';
import { StaffProfile } from '../database/entities/staff-profile.entity';
import { Role, RoleEnum } from '../database/entities/role.entity';
import { RefreshToken } from '../database/entities/refresh-token.entity';
import { EventsService } from '../events/events.service';

import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { UpdateStaffRolesDto } from './dto/update-staff-roles.dto';
import { UpdateStaffStatusDto } from './dto/update-staff-status.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Injectable()
export class StaffService {
  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(StaffProfile)
    private staffProfileRepo: Repository<StaffProfile>,
    @InjectRepository(Role)
    private roleRepo: Repository<Role>,
    @InjectRepository(RefreshToken)
    private refreshTokenRepo: Repository<RefreshToken>,
    private eventsService: EventsService,
  ) {}

  async createStaff(dto: CreateStaffDto) {
    // 1. Validar no-asignabilidad del rol ADMINISTRADOR (BR-AUTH-002, REQ-AUTH-008)
    if (dto.roles.includes(RoleEnum.ADMINISTRADOR)) {
      throw new BadRequestException(
        'El rol ADMINISTRADOR no es asignable al personal operativo',
      );
    }

    if (!dto.roles || dto.roles.length === 0) {
      throw new BadRequestException(
        'Debe asignar al menos un rol operativo al empleado',
      );
    }

    // 2. Obtener las entidades de los roles solicitados
    const roleEntities = await this.roleRepo.find({
      where: { code: In(dto.roles) },
    });

    if (roleEntities.length !== dto.roles.length) {
      // Si algún rol no existe en la BD, crearlo
      for (const roleCode of dto.roles) {
        let role = roleEntities.find((r) => r.code === roleCode);
        if (!role) {
          role = this.roleRepo.create({
            code: roleCode,
            name: roleCode,
            description: `Rol de ${roleCode}`,
            isAssignable: true,
          });
          await this.roleRepo.save(role);
          roleEntities.push(role);
        }
      }
    }

    // 3. Generar ID único XYYYYYY (BR-AUTH-004, BR-AUTH-005, BR-AUTH-006, INV-AUTH-003)
    const primaryRole = dto.roles[0];
    const prefix = this.getRolePrefix(primaryRole);
    const staffId = await this.generateUniqueStaffId(prefix);

    // 4. Contraseña temporal aleatoria segura
    const tempPassword =
      dto.initialPassword ||
      this.generateRandomTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    // 5. Crear Usuario y Perfil
    const user = this.userRepo.create({
      userType: UserType.STAFF,
      email: null,
      passwordHash,
      passwordStatus: PasswordStatus.TEMPORARY,
      temporaryPassword: tempPassword,
      isActive: true,
      roles: roleEntities,
    });
    await this.userRepo.save(user);

    const profile = this.staffProfileRepo.create({
      userId: user.id,
      staffId,
      firstName: dto.firstName,
      lastName: dto.lastName,
      phone: dto.phone,
    });
    await this.staffProfileRepo.save(profile);

    user.staffProfile = profile;

    // 6. Publicar evento a RabbitMQ (REQ-AUTH-017)
    await this.eventsService.publishStaffCreated({
      userId: user.id,
      staffId,
      firstName: profile.firstName,
      lastName: profile.lastName,
      roles: dto.roles,
      isActive: true,
    });

    return {
      message: 'Miembro del personal registrado exitosamente',
      staffId,
      temporaryPassword: tempPassword,
      user: {
        id: user.id,
        staffId,
        firstName: profile.firstName,
        lastName: profile.lastName,
        roles: dto.roles,
        passwordStatus: user.passwordStatus,
        isActive: user.isActive,
      },
    };
  }

  async findAllStaff(role?: string, isActive?: boolean) {
    const query = this.userRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.staffProfile', 'profile')
      .leftJoinAndSelect('user.roles', 'role')
      .where('user.userType = :userType', { userType: UserType.STAFF });

    if (isActive !== undefined) {
      query.andWhere('user.isActive = :isActive', { isActive });
    }

    if (role) {
      query.andWhere('role.code = :role', { role });
    }

    const users = await query.getMany();

    return users.map((u) => ({
      id: u.id,
      staffId: u.staffProfile?.staffId,
      firstName: u.staffProfile?.firstName,
      lastName: u.staffProfile?.lastName,
      phone: u.staffProfile?.phone,
      roles: u.roles.map((r) => r.code),
      isActive: u.isActive,
      passwordStatus: u.passwordStatus,
      temporaryPassword:
        u.passwordStatus === PasswordStatus.TEMPORARY ? u.temporaryPassword : null,
      createdAt: u.createdAt,
    }));
  }

  async findStaffById(id: string) {
    const user = await this.userRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.staffProfile', 'profile')
      .leftJoinAndSelect('user.roles', 'role')
      .where('user.userType = :userType', { userType: UserType.STAFF })
      .andWhere('(user.id = :id OR profile.staffId = :id)', { id })
      .getOne();

    if (!user) {
      throw new NotFoundException('Miembro del personal no encontrado');
    }

    return {
      id: user.id,
      staffId: user.staffProfile?.staffId,
      firstName: user.staffProfile?.firstName,
      lastName: user.staffProfile?.lastName,
      phone: user.staffProfile?.phone,
      roles: user.roles.map((r) => r.code),
      isActive: user.isActive,
      passwordStatus: user.passwordStatus,
      temporaryPassword:
        user.passwordStatus === PasswordStatus.TEMPORARY ? user.temporaryPassword : null,
      createdAt: user.createdAt,
    };
  }

  async updateRoles(id: string, dto: UpdateStaffRolesDto) {
    if (dto.roles.includes(RoleEnum.ADMINISTRADOR)) {
      throw new BadRequestException(
        'El rol ADMINISTRADOR no es asignable al personal operativo',
      );
    }

    if (!dto.roles || dto.roles.length === 0) {
      throw new BadRequestException(
        'El personal debe conservar al menos un rol operativo',
      );
    }

    const user = await this.userRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.staffProfile', 'profile')
      .leftJoinAndSelect('user.roles', 'role')
      .where('user.userType = :userType', { userType: UserType.STAFF })
      .andWhere('(user.id = :id OR profile.staffId = :id)', { id })
      .getOne();

    if (!user) {
      throw new NotFoundException('Miembro del personal no encontrado');
    }

    const roleEntities = await this.roleRepo.find({
      where: { code: In(dto.roles) },
    });

    user.roles = roleEntities;
    await this.userRepo.save(user);

    // Publicar evento RabbitMQ
    await this.eventsService.publishStaffRolesUpdated({
      userId: user.id,
      staffId: user.staffProfile?.staffId || '',
      firstName: user.staffProfile?.firstName || '',
      lastName: user.staffProfile?.lastName || '',
      roles: dto.roles,
      isActive: user.isActive,
    });

    return {
      message: 'Roles de personal actualizados exitosamente',
      staffId: user.staffProfile?.staffId,
      roles: dto.roles,
    };
  }

  async updateStatus(id: string, dto: UpdateStaffStatusDto) {
    const user = await this.userRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.staffProfile', 'profile')
      .leftJoinAndSelect('user.roles', 'role')
      .where('user.userType = :userType', { userType: UserType.STAFF })
      .andWhere('(user.id = :id OR profile.staffId = :id)', { id })
      .getOne();

    if (!user) {
      throw new NotFoundException('Miembro del personal no encontrado');
    }

    user.isActive = dto.isActive;
    await this.userRepo.save(user);

    // Si se desactiva, revocar sesiones activas de inmediato (BR-AUTH-014)
    if (!dto.isActive) {
      await this.refreshTokenRepo.update(
        { userId: user.id, isRevoked: false },
        { isRevoked: true },
      );
    }

    // Publicar evento RabbitMQ
    await this.eventsService.publishStaffStatusChanged({
      userId: user.id,
      staffId: user.staffProfile?.staffId || '',
      firstName: user.staffProfile?.firstName || '',
      lastName: user.staffProfile?.lastName || '',
      roles: user.roles ? user.roles.map((r) => r.code) : [],
      isActive: user.isActive,
    });

    return {
      message: `Personal ${dto.isActive ? 'activado' : 'desactivado'} exitosamente`,
      staffId: user.staffProfile?.staffId,
      isActive: user.isActive,
    };
  }

  async updateStaff(id: string, dto: UpdateStaffDto) {
    const user = await this.userRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.staffProfile', 'profile')
      .leftJoinAndSelect('user.roles', 'role')
      .where('user.userType = :userType', { userType: UserType.STAFF })
      .andWhere('(user.id = :id OR profile.staffId = :id)', { id })
      .getOne();

    if (!user) {
      throw new NotFoundException('Miembro del personal no encontrado');
    }

    if (dto.firstName !== undefined && user.staffProfile) {
      user.staffProfile.firstName = dto.firstName.trim();
    }
    if (dto.lastName !== undefined && user.staffProfile) {
      user.staffProfile.lastName = dto.lastName.trim();
    }
    if (user.staffProfile) {
      await this.staffProfileRepo.save(user.staffProfile);
    }

    if (dto.roles && dto.roles.length > 0) {
      if (dto.roles.includes(RoleEnum.ADMINISTRADOR)) {
        throw new BadRequestException(
          'El rol ADMINISTRADOR no es asignable al personal operativo',
        );
      }
      const roleEntities = await this.roleRepo.find({
        where: { code: In(dto.roles) },
      });
      user.roles = roleEntities;
    }

    if (dto.isActive !== undefined) {
      user.isActive = dto.isActive;
      if (!user.isActive) {
        await this.refreshTokenRepo.update(
          { userId: user.id, isRevoked: false },
          { isRevoked: true },
        );
      }
    }

    await this.userRepo.save(user);

    return this.findStaffById(user.id);
  }

  async deleteStaff(id: string) {
    const user = await this.userRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.staffProfile', 'profile')
      .where('user.userType = :userType', { userType: UserType.STAFF })
      .andWhere('(user.id = :id OR profile.staffId = :id)', { id })
      .getOne();

    if (!user) {
      throw new NotFoundException('Miembro del personal no encontrado');
    }

    const staffId = user.staffProfile?.staffId || '';
    const userId = user.id;

    // 1. Revocar y eliminar tokens
    await this.refreshTokenRepo.delete({ userId });

    // 2. Eliminar staff profile
    if (user.staffProfile) {
      await this.staffProfileRepo.delete({ userId });
    }

    // 3. Eliminar usuario
    await this.userRepo.delete({ id: userId });

    // 4. Publicar evento a RabbitMQ
    await this.eventsService.publishStaffDeleted({
      userId,
      staffId,
    });

    return {
      message: 'Colaborador eliminado definitivamente del sistema',
      staffId,
    };
  }

  async resetPassword(id: string, dto?: ResetPasswordDto) {
    const user = await this.userRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.staffProfile', 'profile')
      .where('user.userType = :userType', { userType: UserType.STAFF })
      .andWhere('(user.id = :id OR profile.staffId = :id)', { id })
      .getOne();

    if (!user) {
      throw new NotFoundException('Miembro del personal no encontrado');
    }

    const tempPassword =
      dto?.temporaryPassword ||
      this.generateRandomTempPassword();
    user.passwordHash = await bcrypt.hash(tempPassword, 10);
    user.passwordStatus = PasswordStatus.TEMPORARY;
    user.temporaryPassword = tempPassword;
    await this.userRepo.save(user);

    // Revocar sesiones activas
    await this.refreshTokenRepo.update(
      { userId: user.id, isRevoked: false },
      { isRevoked: true },
    );

    return {
      message:
        'Contraseña restablecida exitosamente. El empleado deberá cambiarla en su siguiente ingreso.',
      staffId: user.staffProfile?.staffId,
      temporaryPassword: tempPassword,
    };
  }

  private generateRandomTempPassword(): string {
    const numbers = Math.floor(1000 + Math.random() * 9000);
    return `Fmat${numbers}!`;
  }

  private getRolePrefix(role: RoleEnum): string {
    switch (role) {
      case RoleEnum.HOST:
        return 'H';
      case RoleEnum.ALMACENISTA:
        return 'A';
      case RoleEnum.MESERO:
        return 'M';
      case RoleEnum.CHEF_MASTER:
        return 'C';
      default:
        return 'E';
    }
  }

  private async generateUniqueStaffId(prefix: string): Promise<string> {
    const count = await this.staffProfileRepo.count();
    let sequence = count + 1;
    let candidate = `${prefix}${String(sequence).padStart(6, '0')}`;

    while (await this.staffProfileRepo.findOne({ where: { staffId: candidate } })) {
      sequence += 1;
      candidate = `${prefix}${String(sequence).padStart(6, '0')}`;
    }

    return candidate;
  }
}
