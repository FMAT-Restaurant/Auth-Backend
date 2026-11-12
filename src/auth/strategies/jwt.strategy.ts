import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';

import { User, PasswordStatus } from '../../database/entities/user.entity';
import { assertValidJwtSecret } from '../../common/config/env.validation';

export interface JwtPayload {
  sub: string;
  staffId: string;
  email: string | null;
  roles: string[];
  mustChangePassword: boolean;
  /** Versión de sesión del usuario al emitir el token (ver User.tokenVersion). */
  tv?: number;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      algorithms: ['HS256'],
      secretOrKey: assertValidJwtSecret(configService.get<string>('JWT_SECRET')),
    });
  }

  /**
   * Además de la firma, se consulta la base en cada petición: si el usuario se
   * eliminó, se desactivó o su versión de sesión cambió (roles, contraseña,
   * cierre de sesión), el access token deja de valer aunque no haya expirado.
   * Los roles y el estado de la contraseña se toman de la base, no del token.
   */
  async validate(payload: JwtPayload) {
    if (!payload.sub) {
      throw new UnauthorizedException('Token inválido: Faltan claims requeridos');
    }

    const user = await this.userRepo.findOne({ where: { id: payload.sub } });
    if (!user?.isActive) {
      throw new UnauthorizedException('La sesión ya no es válida');
    }

    // Los tokens emitidos antes de existir `tv` se consideran versión 0.
    const tokenVersion = typeof payload.tv === 'number' ? payload.tv : 0;
    if (tokenVersion !== (user.tokenVersion ?? 0)) {
      throw new UnauthorizedException('La sesión ya no es válida');
    }

    return {
      userId: user.id,
      staffId: payload.staffId,
      email: user.email,
      roles: user.roles ? user.roles.map((r) => r.code) : [],
      mustChangePassword: user.passwordStatus === PasswordStatus.TEMPORARY,
    };
  }
}
