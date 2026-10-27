import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'node:crypto';

import { User, UserType, PasswordStatus } from '../database/entities/user.entity';
import { Role, RoleEnum } from '../database/entities/role.entity';
import { StaffProfile } from '../database/entities/staff-profile.entity';
import { RefreshToken } from '../database/entities/refresh-token.entity';
import { AuditLog } from '../database/entities/audit-log.entity';

import { SetupAdminDto } from './dto/setup-admin.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { resolveViewsForRoles } from '../common/constants/views.constant';

// Hash bcrypt (costo 10) de una cadena aleatoria descartada. Solo se usa para
// igualar el tiempo de respuesta cuando el usuario no existe.
const DUMMY_PASSWORD_HASH =
  '$2b$10$rCXTkqe0qZpcAUhkUikG7uyLuSmNv4h.IjpS8qRzBrzj3Bfw59mAe';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,
    @InjectRepository(StaffProfile)
    private readonly staffProfileRepo: Repository<StaffProfile>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
    @InjectRepository(AuditLog)
    private readonly auditLogRepo: Repository<AuditLog>,
    private readonly jwtService: JwtService,
  ) {}

  async getSetupStatus(): Promise<{ configured: boolean }> {
    const admin = await this.userRepo.findOne({
      where: { userType: UserType.ADMIN },
    });
    return {
      configured: Boolean(admin),
    };
  }

  async setupAdmin(dto: SetupAdminDto) {
    const existingAdmin = await this.userRepo.findOne({
      where: { userType: UserType.ADMIN },
    });
    if (existingAdmin) {
      throw new ConflictException(
        'El administrador inicial ya ha sido configurado en el sistema',
      );
    }

    const existingUser = await this.userRepo.findOne({
      where: { email: dto.email.toLowerCase().trim() },
    });
    if (existingUser) {
      throw new ConflictException(
        'El correo electrónico ya se encuentra registrado en el sistema',
      );
    }

    let adminRole = await this.roleRepo.findOne({
      where: { code: RoleEnum.ADMINISTRADOR },
    });
    if (!adminRole) {
      adminRole = this.roleRepo.create({
        code: RoleEnum.ADMINISTRADOR,
        name: 'Administrador',
        description: 'Propietario / Gerente con control total del sistema local',
        isAssignable: false,
      });
      await this.roleRepo.save(adminRole);
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const adminUser = this.userRepo.create({
      userType: UserType.ADMIN,
      email: dto.email.toLowerCase().trim(),
      passwordHash,
      passwordStatus: PasswordStatus.ACTIVE,
      isActive: true,
      roles: [adminRole],
    });
    await this.userRepo.save(adminUser);

    const staffId = 'ADM000001';
    const profile = this.staffProfileRepo.create({
      userId: adminUser.id,
      staffId,
      firstName: dto.firstName?.trim() || 'Admin',
      lastName: dto.lastName?.trim() || 'Principal',
      phone: '',
    });
    await this.staffProfileRepo.save(profile);
    adminUser.staffProfile = profile;

    const tokens = await this.generateTokens(adminUser, staffId);

    await this.logAudit(adminUser.id, 'SETUP_ADMIN', {
      email: adminUser.email,
      staffId,
    });

    return {
      message: 'Cuenta de Administrador inicial configurada exitosamente',
      user: {
        id: adminUser.id,
        email: adminUser.email,
        staffId,
        roles: [RoleEnum.ADMINISTRADOR],
      },
      ...tokens,
    };
  }

  async login(dto: LoginDto) {
    const identifier = dto.identifier.trim();
    let user: User | null = null;
    let staffId = 'ADMIN';

    if (identifier.includes('@')) {
      user = await this.userRepo.findOne({
        where: { email: identifier.toLowerCase() },
        relations: ['roles', 'staffProfile'],
      });
      if (user?.staffProfile) {
        staffId = user.staffProfile.staffId;
      }
    } else {
      const profile = await this.staffProfileRepo.findOne({
        where: { staffId: identifier.toUpperCase() },
        relations: ['user', 'user.roles'],
      });
      if (profile?.user) {
        user = profile.user;
        staffId = profile.staffId;
      }
    }

    if (!user?.isActive) {
      // Se hace la misma comparación bcrypt que con un usuario real para que el
      // tiempo de respuesta no revele si el usuario existe (enumeración de usuarios).
      await this.isPasswordMatch(dto.password, DUMMY_PASSWORD_HASH);
      throw new UnauthorizedException('Credenciales inválidas o cuenta deshabilitada');
    }

    const isPasswordValid = await this.isPasswordMatch(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      await this.logAudit(user.id, 'LOGIN_FAILED', { identifier });
      throw new UnauthorizedException('Credenciales inválidas o cuenta deshabilitada');
    }

    const roleCodes = user.roles ? user.roles.map((r) => r.code) : [];
    const permissions = this.extractPermissions(user);
    const mustChangePassword = user.passwordStatus === PasswordStatus.TEMPORARY;

    const tokens = await this.generateTokens(user, staffId, mustChangePassword);

    await this.logAudit(user.id, 'LOGIN_SUCCESS', { staffId });

    return {
      message: 'Inicio de sesión exitoso',
      mustChangePassword,
      user: {
        id: user.id,
        staffId,
        email: user.email,
        roles: roleCodes,
        permissions,
      },
      ...tokens,
    };
  }

  async changeInitialPassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['roles', 'staffProfile'],
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const cleanCurrent = dto.currentPassword ? dto.currentPassword.trim() : '';
    const cleanNew = dto.newPassword ? dto.newPassword.trim() : '';

    const isMatch =
      (await bcrypt.compare(dto.currentPassword, user.passwordHash)) ||
      (await bcrypt.compare(cleanCurrent, user.passwordHash));
    if (!isMatch) {
      throw new BadRequestException('La contraseña actual ingresada es incorrecta');
    }

    user.passwordHash = await bcrypt.hash(cleanNew, 10);
    user.passwordStatus = PasswordStatus.ACTIVE;
    user.temporaryPassword = null;
    await this.userRepo.save(user);

    await this.refreshTokenRepo.update(
      { userId: user.id, isRevoked: false },
      { isRevoked: true },
    );

    const staffId = user.staffProfile ? user.staffProfile.staffId : 'ADMIN';
    const tokens = await this.generateTokens(user, staffId, false);

    await this.logAudit(user.id, 'PASSWORD_CHANGED', { staffId });

    return {
      message: 'Contraseña actualizada exitosamente. La cuenta ahora está activa.',
      mustChangePassword: false,
      ...tokens,
    };
  }

  async refresh(dto: RefreshTokenDto) {
    const tokenHash = this.hashToken(dto.refreshToken);

    const record = await this.refreshTokenRepo.findOne({
      where: { tokenHash, isRevoked: false },
      relations: ['user', 'user.roles', 'user.staffProfile'],
    });

    if (!record || record.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token inválido o expirado');
    }

    record.isRevoked = true;
    await this.refreshTokenRepo.save(record);

    const user = record.user;
    if (!user?.isActive) {
      throw new UnauthorizedException('Usuario inactivo');
    }

    const staffId = user.staffProfile ? user.staffProfile.staffId : 'ADMIN';
    const mustChangePassword = user.passwordStatus === PasswordStatus.TEMPORARY;

    return this.generateTokens(user, staffId, mustChangePassword);
  }

  async logout(userId: string) {
    await this.refreshTokenRepo.update(
      { userId, isRevoked: false },
      { isRevoked: true },
    );
    await this.logAudit(userId, 'LOGOUT', {});
    return { message: 'Sesión cerrada exitosamente' };
  }

  async getMe(userId: string) {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['roles', 'staffProfile'],
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const staffId = user.staffProfile ? user.staffProfile.staffId : 'ADMIN';
    const roles = user.roles ? user.roles.map((r) => r.code) : [];
    const permissions = this.extractPermissions(user);
    const allowedViews = resolveViewsForRoles(roles);

    return {
      id: user.id,
      staffId,
      firstName: user.staffProfile?.firstName,
      lastName: user.staffProfile?.lastName,
      phone: user.staffProfile?.phone,
      email: user.email,
      userType: user.userType,
      roles,
      permissions,
      passwordStatus: user.passwordStatus,
      mustChangePassword: user.passwordStatus === PasswordStatus.TEMPORARY,
      allowedViews,
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['staffProfile'],
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    if (user.userType !== UserType.ADMIN) {
      throw new ForbiddenException(
        'Solo el Administrador tiene permisos para editar información de perfil',
      );
    }

    if (user.staffProfile) {
      user.staffProfile.firstName = dto.firstName.trim();
      user.staffProfile.lastName = dto.lastName.trim();
      if (dto.phone !== undefined) {
        user.staffProfile.phone = dto.phone.trim();
      }
      await this.staffProfileRepo.save(user.staffProfile);
    } else {
      const count = await this.staffProfileRepo.count();
      let staffId = `ADM${String(count + 1).padStart(6, '0')}`;
      const existing = await this.staffProfileRepo.findOne({ where: { staffId } });
      if (existing) {
        staffId = `ADM${String(crypto.randomInt(100000, 1000000))}`;
      }

      const profile = this.staffProfileRepo.create({
        userId: user.id,
        staffId,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        phone: dto.phone?.trim() || '',
      });
      await this.staffProfileRepo.save(profile);
      user.staffProfile = profile;
    }

    await this.logAudit(userId, 'PROFILE_UPDATED', {
      firstName: dto.firstName,
      lastName: dto.lastName,
    });

    return {
      message: 'Perfil actualizado exitosamente',
      user: {
        id: user.id,
        firstName: user.staffProfile.firstName,
        lastName: user.staffProfile.lastName,
        phone: user.staffProfile.phone,
        displayName: `${user.staffProfile.firstName} ${user.staffProfile.lastName}`.trim(),
      },
    };
  }

  async deleteAccount(userId: string) {
    const user = await this.userRepo.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    if (user.userType !== UserType.ADMIN) {
      throw new ForbiddenException(
        'Acceso denegado: El personal operativo no puede eliminar su cuenta. Solo el Administrador puede gestionar bajas.',
      );
    }

    await this.refreshTokenRepo.update(
      { userId, isRevoked: false },
      { isRevoked: true },
    );

    await this.staffProfileRepo.delete({ userId });
    await this.userRepo.delete({ id: userId });
    await this.logAudit(null, 'USER_DELETED', { userId });
    return {
      message: 'Cuenta eliminada exitosamente',
    };
  }

  async requestPasswordReset(dto: RequestPasswordResetDto) {
    const rawIdentifier = dto.identifier ? dto.identifier.trim() : '';
    if (!rawIdentifier) {
      throw new BadRequestException('El identificador o matrícula es obligatorio');
    }

    const cleanStaffId = rawIdentifier.toUpperCase();

    const user = await this.userRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.staffProfile', 'staffProfile')
      .where('user.userType = :userType', { userType: UserType.STAFF })
      .andWhere(
        '(UPPER(staffProfile.staffId) = :staffId OR UPPER(user.email) = :email)',
        { staffId: cleanStaffId, email: rawIdentifier.toUpperCase() },
      )
      .getOne();

    if (user && user.isActive) {
      user.passwordResetRequested = true;
      await this.userRepo.save(user);
      await this.logAudit(user.id, 'PASSWORD_RESET_REQUESTED', {
        staffId: user.staffProfile?.staffId,
      });
    }

    return {
      message: 'Solicitud de cambio de contraseña enviada exitosamente',
    };
  }

  private async isPasswordMatch(password: string, hash: string): Promise<boolean> {
    const cleanPassword = password ? password.trim() : '';
    return (
      (await bcrypt.compare(password, hash)) ||
      (await bcrypt.compare(cleanPassword, hash))
    );
  }

  private extractPermissions(user: User): string[] {
    const roles = user.roles ? user.roles.map((r) => r.code) : [];
    if (roles.includes(RoleEnum.ADMINISTRADOR) || user.userType === UserType.ADMIN) {
      return ['*'];
    }
    const permissions = new Set<string>();
    if (user.roles) {
      for (const r of user.roles) {
        if (r.permissions && Array.isArray(r.permissions)) {
          for (const p of r.permissions) {
            permissions.add(p);
          }
        }
      }
    }
    return Array.from(permissions);
  }

  private async generateTokens(
    user: User,
    staffId: string,
    mustChangePassword = false,
  ) {
    const roles = user.roles ? user.roles.map((r) => r.code) : [];
    const permissions = this.extractPermissions(user);

    const payload = {
      iss: 'urn:fmat:restaurant:auth',
      sub: user.id,
      staffId,
      email: user.email,
      roles,
      permissions,
      mustChangePassword,
    };

    const accessToken = this.jwtService.sign(payload, { expiresIn: '1h' });

    const rawRefreshToken = crypto.randomBytes(40).toString('hex');
    const tokenHash = this.hashToken(rawRefreshToken);

    const refreshTokenEntity = this.refreshTokenRepo.create({
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 días
      isRevoked: false,
    });
    await this.refreshTokenRepo.save(refreshTokenEntity);

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      tokenType: 'Bearer',
      expiresIn: 3600,
    };
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private async logAudit(userId: string | null, action: string, details: any) {
    try {
      const log = this.auditLogRepo.create({
        userId,
        action,
        details: JSON.stringify(details),
      });
      await this.auditLogRepo.save(log);
    } catch {
      // No interrumpir flujo si falla el log
    }
  }
}
