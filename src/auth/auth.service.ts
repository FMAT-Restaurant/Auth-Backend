import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
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

const DEFAULT_REFRESH_TOKEN_TTL_DAYS = 7;
const MAX_REFRESH_TOKEN_TTL_DAYS = 30;

/**
 * Vida del refresh token en milisegundos (REFRESH_TOKEN_TTL_DAYS, 7 días por
 * defecto). El frontend guarda la sesión en localStorage (Auth-Frontend #6), así
 * que una vida corta limita lo que puede hacer alguien que llegue a robarla.
 */
export function refreshTokenTtlMs(env: NodeJS.ProcessEnv = process.env): number {
  const days = Number(env.REFRESH_TOKEN_TTL_DAYS);
  const valid = Number.isFinite(days) && days > 0 && days <= MAX_REFRESH_TOKEN_TTL_DAYS;
  return (valid ? days : DEFAULT_REFRESH_TOKEN_TTL_DAYS) * 24 * 60 * 60 * 1000;
}

@Injectable()
export class AuthService {
  /**
   * Hash bcrypt de un valor aleatorio generado al arrancar el servicio (nunca se
   * guarda ni se escribe en el código). Solo se usa para que el login tarde lo
   * mismo exista o no el usuario, y así no se pueda saber qué usuarios existen.
   */
  private readonly timingReferenceHash: Promise<string> = bcrypt.hash(
    crypto.randomBytes(32).toString('hex'),
    10,
  );

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
    private readonly dataSource: DataSource,
  ) {}

  /** Clave del bloqueo de Postgres que serializa las llamadas a setup-admin. */
  private static readonly SETUP_ADMIN_LOCK_KEY = 74_201_901;

  private static readonly INITIAL_ADMIN_STAFF_ID = 'ADM000001';

  /**
   * El sistema se considera configurado en cuanto existe cualquier usuario.
   * Antes solo se buscaba un ADMIN, así que al borrar la única cuenta de
   * administrador setup-admin volvía a quedar abierto para cualquiera (#12).
   */
  async getSetupStatus(): Promise<{ configured: boolean }> {
    const users = await this.userRepo.count();
    return {
      configured: users > 0,
    };
  }

  async setupAdmin(dto: SetupAdminDto) {
    const email = dto.email.toLowerCase().trim();

    // Comprobación e inserción dentro de una sola transacción con un bloqueo de
    // Postgres: si llegan varias peticiones a la vez, se atienden una por una y
    // solo la primera crea al administrador (#13). El usuario y su perfil se
    // guardan juntos, así que un fallo no deja cuentas a medias.
    const adminUser = await this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock($1)', [
        AuthService.SETUP_ADMIN_LOCK_KEY,
      ]);

      const existingUsers = await manager.count(User);
      if (existingUsers > 0) {
        throw new ConflictException(
          'El administrador inicial ya ha sido configurado en el sistema',
        );
      }

      const adminRole = await this.ensureAdminRole(manager);

      const passwordHash = await bcrypt.hash(dto.password, 10);
      const user = manager.create(User, {
        userType: UserType.ADMIN,
        email,
        passwordHash,
        passwordStatus: PasswordStatus.ACTIVE,
        isActive: true,
        roles: [adminRole],
      });
      await manager.save(user);

      const profile = manager.create(StaffProfile, {
        userId: user.id,
        staffId: AuthService.INITIAL_ADMIN_STAFF_ID,
        firstName: dto.firstName?.trim() || 'Admin',
        lastName: dto.lastName?.trim() || 'Principal',
        phone: '',
      });
      await manager.save(profile);
      user.staffProfile = profile;
      return user;
    });

    const staffId = AuthService.INITIAL_ADMIN_STAFF_ID;
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

  private async ensureAdminRole(manager: EntityManager): Promise<Role> {
    const existing = await manager.findOne(Role, {
      where: { code: RoleEnum.ADMINISTRADOR },
    });
    if (existing) return existing;

    const role = manager.create(Role, {
      code: RoleEnum.ADMINISTRADOR,
      name: 'Administrador',
      description: 'Propietario / Gerente con control total del sistema local',
      isAssignable: false,
    });
    return manager.save(role);
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
      await this.isPasswordMatch(dto.password, await this.timingReferenceHash);
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

    // Las contraseñas se usan tal cual, sin recortar espacios (#16): antes se
    // validaba la longitud con espacios y se guardaba recortada, lo que permitía
    // contraseñas efectivas de 1 carácter.
    const isMatch = await this.isPasswordMatch(dto.currentPassword, user.passwordHash);
    if (!isMatch) {
      throw new BadRequestException('La contraseña actual ingresada es incorrecta');
    }

    user.passwordHash = await bcrypt.hash(dto.newPassword, 10);
    user.passwordStatus = PasswordStatus.ACTIVE;
    // Invalida los access tokens emitidos con la contraseña anterior (#15).
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
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
    // Cierra también los access tokens que sigan vigentes (#15).
    await this.userRepo.increment({ id: userId }, 'tokenVersion', 1);
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

    // Si el único administrador pudiera borrarse, el sistema se quedaría sin
    // administración (#12).
    const activeAdmins = await this.userRepo.count({
      where: { userType: UserType.ADMIN, isActive: true },
    });
    if (activeAdmins <= 1) {
      throw new ConflictException(
        'No se puede eliminar la única cuenta de Administrador del sistema',
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

    // No es un reseteo automático: se avisa al administrador, que asigna una
    // contraseña temporal nueva desde el panel de personal (#23). El mensaje es
    // el mismo exista o no la cuenta, para no revelar qué cuentas existen.
    return {
      message:
        'Solicitud registrada. Si la cuenta existe, el Administrador te asignará una contraseña temporal nueva.',
    };
  }

  /** Una sola comparación, con la contraseña exactamente como se escribió (#16). */
  private async isPasswordMatch(password: string, hash: string): Promise<boolean> {
    if (typeof password !== 'string' || password.length === 0) {
      return false;
    }
    return bcrypt.compare(password, hash);
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
            // "*" es exclusivo del administrador, aunque un rol lo tenga guardado (#18).
            if (p !== '*') permissions.add(p);
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
      tv: user.tokenVersion ?? 0,
    };

    const accessToken = this.jwtService.sign(payload, { expiresIn: '1h' });

    const rawRefreshToken = crypto.randomBytes(40).toString('hex');
    const tokenHash = this.hashToken(rawRefreshToken);

    const refreshTokenEntity = this.refreshTokenRepo.create({
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + refreshTokenTtlMs()),
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
