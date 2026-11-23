import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService, refreshTokenTtlMs } from './auth.service';
import { SetupAdminDto } from './dto/setup-admin.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

export const REFRESH_TOKEN_COOKIE = 'fmat_refresh_token';

function readCookie(req: Request | undefined, name: string): string | undefined {
  const raw = req?.headers?.cookie;
  if (!raw) return undefined;
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (key === name) {
      const value = part.slice(idx + 1).trim();
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    }
  }
  return undefined;
}

function isSecureCookie(req?: Request): boolean {
  return Boolean(
    req?.secure ||
    req?.headers?.['x-forwarded-proto'] === 'https' ||
    process.env.COOKIE_SECURE === 'true',
  );
}

function setRefreshCookie(
  req: Request | undefined,
  res: Response | undefined,
  refreshToken?: string,
): void {
  if (!res || !refreshToken) return;
  res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureCookie(req),
    path: '/api/v1/auth',
    maxAge: refreshTokenTtlMs(),
  });
}

function clearRefreshCookie(req?: Request, res?: Response): void {
  if (!res) return;
  res.clearCookie(REFRESH_TOKEN_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureCookie(req),
    path: '/api/v1/auth',
  });
}

function sanitizeResponseForBrowser<T extends { refreshToken?: string }>(
  result: T,
  req?: Request,
): T {
  // Para peticiones desde navegador (que traen Origin), el refresh token viaja
  // exclusivamente en la cookie HttpOnly y no se expone en el cuerpo JSON.
  if (req?.headers?.origin && 'refreshToken' in result) {
    const copy = { ...result };
    delete copy.refreshToken;
    return copy;
  }
  return result;
}

@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Get('setup-status')
  async getSetupStatus() {
    return this.authService.getSetupStatus();
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Post('setup-admin')
  async setupAdmin(
    @Body() dto: SetupAdminDto,
    @Req() req?: Request,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const result = await this.authService.setupAdmin(dto);
    setRefreshCookie(req, res, result.refreshToken);
    return sanitizeResponseForBrowser(result, req);
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() req?: Request,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const result = await this.authService.login(dto);
    setRefreshCookie(req, res, result.refreshToken);
    return sanitizeResponseForBrowser(result, req);
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Post('request-password-reset')
  @HttpCode(HttpStatus.OK)
  async requestPasswordReset(@Body() dto: RequestPasswordResetDto) {
    return this.authService.requestPasswordReset(dto);
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() dto?: RefreshTokenDto,
    @Req() req?: Request,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const refreshToken = dto?.refreshToken || readCookie(req, REFRESH_TOKEN_COOKIE);
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token inválido o expirado');
    }
    const result = await this.authService.refresh({ refreshToken });
    setRefreshCookie(req, res, result.refreshToken);
    return sanitizeResponseForBrowser(result, req);
  }

  @UseGuards(JwtAuthGuard)
  @Post('change-initial-password')
  @HttpCode(HttpStatus.OK)
  async changeInitialPassword(
    @CurrentUser('userId') userId: string,
    @Body() dto: ChangePasswordDto,
    @Req() req?: Request,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const result = await this.authService.changeInitialPassword(userId, dto);
    setRefreshCookie(req, res, result.refreshToken);
    return sanitizeResponseForBrowser(result, req);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getMe(@CurrentUser('userId') userId: string) {
    return this.authService.getMe(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('profile')
  async updateProfile(@CurrentUser('userId') userId: string, @Body() dto: UpdateProfileDto) {
    return this.authService.updateProfile(userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('account')
  @HttpCode(HttpStatus.OK)
  async deleteAccount(
    @CurrentUser('userId') userId: string,
    @Req() req?: Request,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const result = await this.authService.deleteAccount(userId);
    clearRefreshCookie(req, res);
    return result;
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @CurrentUser('userId') userId: string,
    @Req() req?: Request,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const result = await this.authService.logout(userId);
    clearRefreshCookie(req, res);
    return result;
  }
}
