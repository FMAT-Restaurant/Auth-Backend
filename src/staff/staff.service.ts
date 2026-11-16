import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, SelectQueryBuilder } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'node:crypto';

import { User, UserType, PasswordStatus } from '../database/entities/user.entity';
import { StaffProfile } from '../database/entities/staff-profile.entity';
import { Role, RoleEnum } from '../database/entities/role.entity';
import { RefreshToken } from '../database/entities/refresh-token.entity';
import { AuditLog } from '../database/entities/audit-log.entity';
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
    private readonly userRepo: Repository<User>,
    @InjectRepository(StaffProfile)
    private readonly staffProfileRepo: Repository<StaffProfile>,
    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
    @InjectRepository(AuditLog)
    private readonly auditLogRepo: Repository<AuditLog>,
    private readonly eventsService: EventsService,
  ) {}

  async createStaff(dto: CreateStaffDto) {
    // 1-2. Solo roles existentes y asignables; ya no se crean roles al vuelo (#18).
    const roleEntities = await this.resolveAssignableRoles(dto.roles);

    // 3. Generar ID único XYYYYYY (BR-AUTH-004, BR-AUTH-005, BR-AUTH-006, INV-AUTH-003)
    const primaryRole = roleEntities[0].code;
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
      roles: roleEntities.map((r) => r.code),
      isActive: true,
    });

    // La contraseña temporal solo se guarda como hash y se muestra una única vez,
    // en esta respuesta (#14). El listado y el detalle ya no la devuelven.
    return {
      message: 'Miembro del personal registrado exitosamente',
      staffId,
      temporaryPassword: tempPassword,
      user: {
        id: user.id,
        staffId,
        firstName: profile.firstName,
        lastName: profile.lastName,
        roles: roleEntities.map((r) => r.code),
        passwordStatus: user.passwordStatus,
        isActive: user.isActive,
      },
    };
  }

  async findAllStaff(role?: string, isActive?: boolean, passwordResetRequested?: boolean) {
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

    // Permite al panel listar solo las solicitudes de reseteo pendientes (#23).
    if (passwordResetRequested !== undefined) {
      query.andWhere('user.passwordResetRequested = :passwordResetRequested', {
        passwordResetRequested,
      });
    }

    const users = await query.getMany();

    return users.map((u) => ({
      id: u.id,
      staffId: u.staffProfile?.staffId,
      firstName: u.staffProfile?.firstName,
      lastName: u.staffProfile?.lastName,
      phone: u.staffProfile?.phone,
      roles: u.roles.map((r) => r.code),
      permissions: Array.from(new Set(u.roles.flatMap((r) => r.permissions || []))),
      isActive: u.isActive,
      passwordStatus: u.passwordStatus,
      passwordResetRequested: Boolean(u.passwordResetRequested),
      createdAt: u.createdAt,
    }));
  }

  async findStaffById(id: string) {
    const qb = this.userRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.staffProfile', 'profile')
      .leftJoinAndSelect('user.roles', 'role')
      .where('user.userType = :userType', { userType: UserType.STAFF });

    this.applyUserOrStaffIdFilter(qb, id);

    const user = await qb.getOne();

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
      permissions: Array.from(new Set(user.roles.flatMap((r) => r.permissions || []))),
      isActive: user.isActive,
      passwordStatus: user.passwordStatus,
      passwordResetRequested: Boolean(user.passwordResetRequested),
      createdAt: user.createdAt,
    };
  }

  async updateRoles(id: string, dto: UpdateStaffRolesDto) {
    const roleEntities = await this.resolveAssignableRoles(dto.roles);

    const qb = this.userRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.staffProfile', 'profile')
      .leftJoinAndSelect('user.roles', 'role')
      .where('user.userType = :userType', { userType: UserType.STAFF });

    this.applyUserOrStaffIdFilter(qb, id);

    const user = await qb.getOne();

    if (!user) {
      throw new NotFoundException('Miembro del personal no encontrado');
    }

    user.roles = roleEntities;
    // Los access tokens con los roles anteriores dejan de valer (#15).
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    await this.userRepo.save(user);

    // Publicar evento RabbitMQ
    await this.eventsService.publishStaffRolesUpdated({
      userId: user.id,
      staffId: user.staffProfile?.staffId || '',
      firstName: user.staffProfile?.firstName || '',
      lastName: user.staffProfile?.lastName || '',
      roles: roleEntities.map((r) => r.code),
      isActive: user.isActive,
    });

    return {
      message: 'Roles de personal actualizados exitosamente',
      staffId: user.staffProfile?.staffId,
      roles: roleEntities.map((r) => r.code),
    };
  }

  async updateStatus(id: string, dto: UpdateStaffStatusDto) {
    const qb = this.userRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.staffProfile', 'profile')
      .leftJoinAndSelect('user.roles', 'role')
      .where('user.userType = :userType', { userType: UserType.STAFF });

    this.applyUserOrStaffIdFilter(qb, id);

    const user = await qb.getOne();

    if (!user) {
      throw new NotFoundException('Miembro del personal no encontrado');
    }

    user.isActive = dto.isActive;
    if (!dto.isActive) {
      // Invalida también los access tokens que aún no expiran (#15).
      user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    }
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
    const qb = this.userRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.staffProfile', 'profile')
      .leftJoinAndSelect('user.roles', 'role')
      .where('user.userType = :userType', { userType: UserType.STAFF });

    this.applyUserOrStaffIdFilter(qb, id);

    const user = await qb.getOne();

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
      user.roles = await this.resolveAssignableRoles(dto.roles);
      user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    }

    if (dto.isActive !== undefined) {
      user.isActive = dto.isActive;
      if (!user.isActive) {
        user.tokenVersion = (user.tokenVersion ?? 0) + 1;
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
    const qb = this.userRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.staffProfile', 'profile')
      .where('user.userType = :userType', { userType: UserType.STAFF });

    this.applyUserOrStaffIdFilter(qb, id);

    const user = await qb.getOne();

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

  async resetPassword(id: string, dto?: ResetPasswordDto, adminId?: string) {
    const qb = this.userRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.staffProfile', 'profile')
      .where('user.userType = :userType', { userType: UserType.STAFF });

    this.applyUserOrStaffIdFilter(qb, id);

    const user = await qb.getOne();

    if (!user) {
      throw new NotFoundException('Miembro del personal no encontrado');
    }

    const tempPassword =
      dto?.temporaryPassword ||
      this.generateRandomTempPassword();
    const hadPendingRequest = Boolean(user.passwordResetRequested);
    user.passwordHash = await bcrypt.hash(tempPassword, 10);
    user.passwordStatus = PasswordStatus.TEMPORARY;
    user.passwordResetRequested = false;
    // Las sesiones abiertas con la contraseña anterior dejan de valer (#15).
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    await this.userRepo.save(user);

    // Revocar sesiones activas
    await this.refreshTokenRepo.update(
      { userId: user.id, isRevoked: false },
      { isRevoked: true },
    );

    // Queda registrado qué administrador atendió el reseteo (#23).
    await this.logAudit(adminId ?? null, 'PASSWORD_RESET_BY_ADMIN', {
      targetUserId: user.id,
      staffId: user.staffProfile?.staffId,
      hadPendingRequest,
    });

    return {
      message:
        'Contraseña restablecida exitosamente. El empleado deberá cambiarla en su siguiente ingreso.',
      staffId: user.staffProfile?.staffId,
      temporaryPassword: tempPassword,
    };
  }

  /**
   * Convierte los códigos recibidos en roles existentes y asignables (#18).
   * Antes, un código desconocido (por ejemplo "administrador" en minúsculas)
   * se creaba como rol nuevo, y los roles no asignables se podían asignar.
   */
  private async resolveAssignableRoles(codes: string[] | undefined): Promise<Role[]> {
    const normalized = Array.from(
      new Set((codes ?? []).map((c) => String(c).trim().toUpperCase()).filter(Boolean)),
    );

    if (normalized.length === 0) {
      throw new BadRequestException('Debe asignar al menos un rol operativo al empleado');
    }

    if (normalized.includes(RoleEnum.ADMINISTRADOR)) {
      throw new BadRequestException(
        'El rol ADMINISTRADOR no es asignable al personal operativo',
      );
    }

    const found = await this.roleRepo.find({ where: { code: In(normalized) } });
    const byCode = new Map(found.map((r) => [String(r.code).toUpperCase(), r]));

    const missing = normalized.filter((code) => !byCode.has(code));
    if (missing.length > 0) {
      throw new BadRequestException(`Los siguientes roles no existen: ${missing.join(', ')}`);
    }

    const notAssignable = normalized.filter((code) => byCode.get(code)?.isAssignable === false);
    if (notAssignable.length > 0) {
      throw new BadRequestException(
        `Los siguientes roles no se pueden asignar: ${notAssignable.join(', ')}`,
      );
    }

    return normalized.map((code) => byCode.get(code) as Role);
  }

  private async logAudit(userId: string | null, action: string, details: object) {
    try {
      await this.auditLogRepo.save(
        this.auditLogRepo.create({ userId, action, details: JSON.stringify(details) }),
      );
    } catch {
      // La auditoría no debe interrumpir la operación principal.
    }
  }

  private applyUserOrStaffIdFilter(
    qb: SelectQueryBuilder<User>,
    id: string,
  ): SelectQueryBuilder<User> {
    const cleanId = id.trim();
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        cleanId,
      );
    if (isUuid) {
      return qb.andWhere('user.id = :id', { id: cleanId });
    } else {
      return qb.andWhere('UPPER(profile.staffId) = :id', {
        id: cleanId.toUpperCase(),
      });
    }
  }

  /**
   * Genera una contraseña temporal con formato legible `Fmat-XXXX-XXXX`.
   * Usa 8 caracteres aleatorios de un alfabeto de 32 símbolos sin caracteres
   * ambiguos (sin 0/O, 1/I/L), es decir 32^8 ≈ 1.1 billones de combinaciones.
   * Antes eran solo 9,000 (`Fmat` + 4 dígitos), adivinables por fuerza bruta.
   */
  private generateRandomTempPassword(): string {
    const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789!#';
    const pick = () => alphabet[crypto.randomInt(0, alphabet.length)];
    const block = () => Array.from({ length: 4 }, pick).join('');
    return `Fmat-${block()}-${block()}`;
  }

  private getRolePrefix(role: string): string {
    const clean = (role || '').trim().toUpperCase();
    switch (clean) {
      case RoleEnum.HOST:
        return 'H';
      case RoleEnum.ALMACENISTA:
        return 'A';
      case RoleEnum.MESERO:
        return 'M';
      case RoleEnum.CHEF_MASTER:
        return 'C';
      default: {
        const stripped = clean.startsWith('ROL_') ? clean.replace(/^ROL_/, '') : clean;
        const char = stripped.charAt(0);
        return char && /[A-Z]/.test(char) ? char : 'E';
      }
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
