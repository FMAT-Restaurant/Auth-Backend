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
import * as crypto from 'crypto';

import { Restaurant } from '../database/entities/restaurant.entity';
import { User, UserType, PasswordStatus } from '../database/entities/user.entity';
import { Role, RoleEnum } from '../database/entities/role.entity';
import { StaffProfile } from '../database/entities/staff-profile.entity';
import { RefreshToken } from '../database/entities/refresh-token.entity';
import { AuditLog } from '../database/entities/audit-log.entity';

import { RegisterRestaurantDto } from './dto/register-restaurant.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateRestaurantDto } from './dto/update-restaurant.dto';
import { resolveViewsForRoles } from '../common/constants/views.constant';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Restaurant)
    private restaurantRepo: Repository<Restaurant>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(Role)
    private roleRepo: Repository<Role>,
    @InjectRepository(StaffProfile)
    private staffProfileRepo: Repository<StaffProfile>,
    @InjectRepository(RefreshToken)
    private refreshTokenRepo: Repository<RefreshToken>,
    @InjectRepository(AuditLog)
    private auditLogRepo: Repository<AuditLog>,
    private jwtService: JwtService,
  ) {}

  async registerRestaurant(dto: RegisterRestaurantDto) {
    const existingUser = await this.userRepo.findOne({
      where: { email: dto.email.toLowerCase().trim() },
    });
    if (existingUser) {
      throw new ConflictException(
        'El correo electrónico ya se encuentra registrado en el sistema',
      );
    }

    // 1. Crear Restaurante
    const restaurant = this.restaurantRepo.create({
      name: dto.restaurantName,
      commercialName: dto.commercialName || dto.restaurantName,
      address: dto.address,
      status: 'ACTIVE',
    });
    await this.restaurantRepo.save(restaurant);

    // 2. Asegurar existencia de Rol ADMINISTRADOR
    let adminRole = await this.roleRepo.findOne({
      where: { code: RoleEnum.ADMINISTRADOR },
    });
    if (!adminRole) {
      adminRole = this.roleRepo.create({
        code: RoleEnum.ADMINISTRADOR,
        name: 'Administrador',
        description: 'Propietario / Gerente con control total del restaurante',
        isAssignable: false,
      });
      await this.roleRepo.save(adminRole);
    }

    // 3. Crear Usuario Administrador
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const adminUser = this.userRepo.create({
      restaurantId: restaurant.id,
      userType: UserType.ADMIN,
      email: dto.email.toLowerCase().trim(),
      passwordHash,
      passwordStatus: PasswordStatus.ACTIVE,
      isActive: true,
      roles: [adminRole],
    });
    await this.userRepo.save(adminUser);

    // 4. Generar tokens de sesión
    const tokens = await this.generateTokens(adminUser, 'ADMIN');

    await this.logAudit(adminUser.id, 'REGISTER_RESTAURANT', {
      restaurantId: restaurant.id,
      email: adminUser.email,
    });

    return {
      message: 'Restaurante y cuenta de Administrador registrados exitosamente',
      restaurant: {
        id: restaurant.id,
        name: restaurant.name,
      },
      user: {
        id: adminUser.id,
        email: adminUser.email,
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
      // Login de Administrador por Email
      user = await this.userRepo.findOne({
        where: { email: identifier.toLowerCase() },
        relations: ['roles', 'restaurant', 'staffProfile'],
      });
    } else {
      // Login de Personal por Staff ID (XYYYYYY)
      const profile = await this.staffProfileRepo.findOne({
        where: { staffId: identifier.toUpperCase() },
        relations: ['user', 'user.roles', 'user.restaurant'],
      });
      if (profile && profile.user) {
        user = profile.user;
        staffId = profile.staffId;
      }
    }

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Credenciales inválidas o cuenta deshabilitada');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      await this.logAudit(user.id, 'LOGIN_FAILED', { identifier });
      throw new UnauthorizedException('Credenciales inválidas o cuenta deshabilitada');
    }

    const roleCodes = user.roles ? user.roles.map((r) => r.code) : [];
    const mustChangePassword = user.passwordStatus === PasswordStatus.TEMPORARY;

    const tokens = await this.generateTokens(user, staffId, mustChangePassword);

    await this.logAudit(user.id, 'LOGIN_SUCCESS', { staffId });

    return {
      message: 'Inicio de sesión exitoso',
      mustChangePassword,
      user: {
        id: user.id,
        restaurantId: user.restaurantId,
        staffId,
        email: user.email,
        roles: roleCodes,
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

    const isMatch = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!isMatch) {
      throw new BadRequestException('La contraseña actual ingresada es incorrecta');
    }

    // Actualizar hash y estado a ACTIVE
    user.passwordHash = await bcrypt.hash(dto.newPassword, 10);
    user.passwordStatus = PasswordStatus.ACTIVE;
    await this.userRepo.save(user);

    // Revocar refresh tokens previos
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

    // Rota el refresh token (invalida el actual)
    record.isRevoked = true;
    await this.refreshTokenRepo.save(record);

    const user = record.user;
    if (!user || !user.isActive) {
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
      relations: ['roles', 'restaurant', 'staffProfile'],
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const staffId = user.staffProfile ? user.staffProfile.staffId : 'ADMIN';
    const roles = user.roles ? user.roles.map((r) => r.code) : [];
    const allowedViews = resolveViewsForRoles(roles);

    return {
      id: user.id,
      restaurantId: user.restaurantId,
      restaurantName: user.restaurant?.name,
      restaurantCommercialName: user.restaurant?.commercialName,
      restaurantAddress: user.restaurant?.address,
      staffId,
      firstName: user.staffProfile?.firstName,
      lastName: user.staffProfile?.lastName,
      phone: user.staffProfile?.phone,
      email: user.email,
      userType: user.userType,
      roles,
      passwordStatus: user.passwordStatus,
      mustChangePassword: user.passwordStatus === PasswordStatus.TEMPORARY,
      allowedViews,
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['staffProfile', 'restaurant'],
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
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
      while (await this.staffProfileRepo.findOne({ where: { staffId } })) {
        staffId = `ADM${String(Math.floor(100000 + Math.random() * 900000))}`;
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

  async updateRestaurant(userId: string, dto: UpdateRestaurantDto) {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['restaurant'],
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    if (user.userType !== UserType.ADMIN) {
      throw new ForbiddenException(
        'Solo el administrador tiene permisos para modificar la configuración del restaurante',
      );
    }

    let restaurant = user.restaurant;
    if (!restaurant) {
      restaurant = await this.restaurantRepo.findOne({
        where: { id: user.restaurantId },
      });
    }

    if (!restaurant) {
      throw new NotFoundException('Restaurante no encontrado');
    }

    restaurant.name = dto.name.trim();
    if (dto.commercialName !== undefined) {
      restaurant.commercialName = dto.commercialName.trim();
    }
    if (dto.address !== undefined) {
      restaurant.address = dto.address.trim();
    }

    await this.restaurantRepo.save(restaurant);

    await this.logAudit(userId, 'RESTAURANT_UPDATED', {
      restaurantId: restaurant.id,
      name: restaurant.name,
    });

    return {
      message: 'Restaurante actualizado exitosamente',
      restaurant: {
        id: restaurant.id,
        name: restaurant.name,
        commercialName: restaurant.commercialName,
        address: restaurant.address,
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

    await this.refreshTokenRepo.update(
      { userId, isRevoked: false },
      { isRevoked: true },
    );

    if (user.userType === UserType.ADMIN) {
      await this.restaurantRepo.delete({ id: user.restaurantId });
      await this.logAudit(null, 'RESTAURANT_DELETED', {
        restaurantId: user.restaurantId,
        adminUserId: userId,
      });
      return {
        message: 'Restaurante y todas las cuentas asociadas han sido eliminados exitosamente',
      };
    } else {
      await this.staffProfileRepo.delete({ userId });
      await this.userRepo.delete({ id: userId });
      await this.logAudit(null, 'USER_DELETED', { userId });
      return {
        message: 'Cuenta de usuario eliminada exitosamente',
      };
    }
  }

  private async generateTokens(
    user: User,
    staffId: string,
    mustChangePassword = false,
  ) {
    const roles = user.roles ? user.roles.map((r) => r.code) : [];

    const payload = {
      sub: user.id,
      restaurantId: user.restaurantId,
      staffId,
      email: user.email,
      roles,
      mustChangePassword,
    };

    const accessToken = this.jwtService.sign(payload, { expiresIn: '1h' });

    // Generar refresh token criptográfico aleatorio
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
