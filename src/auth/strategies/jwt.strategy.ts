import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

export interface JwtPayload {
  sub: string;
  staffId: string;
  email: string | null;
  roles: string[];
  mustChangePassword: boolean;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>(
        'JWT_SECRET',
        'fmat-restaurant-auth-secret-key-2026',
      ),
    });
  }

  async validate(payload: JwtPayload) {
    if (!payload.sub) {
      throw new UnauthorizedException('Token inválido: Faltan claims requeridos');
    }
    return {
      userId: payload.sub,
      staffId: payload.staffId,
      email: payload.email,
      roles: payload.roles || [],
      mustChangePassword: !!payload.mustChangePassword,
    };
  }
}
