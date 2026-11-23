import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { RoleEnum } from '../../database/entities/role.entity';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const requiredRoles = this.reflector.getAllAndOverride<RoleEnum[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const hasRequiredPermissions = Boolean(requiredPermissions && requiredPermissions.length > 0);
    const hasRequiredRoles = Boolean(requiredRoles && requiredRoles.length > 0);

    if (!hasRequiredPermissions && !hasRequiredRoles) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user?.roles) {
      throw new ForbiddenException('Acceso denegado: El usuario no cuenta con roles autorizados');
    }

    if (hasRequiredPermissions) {
      const isAdmin = user.roles.includes(RoleEnum.ADMINISTRADOR);
      const userPermissions: string[] = Array.isArray(user.permissions) ? user.permissions : [];
      const hasPermission =
        isAdmin ||
        userPermissions.includes('*') ||
        requiredPermissions.some((perm) => userPermissions.includes(perm));

      if (!hasPermission) {
        throw new ForbiddenException(
          'Acceso denegado: El usuario no cuenta con permisos suficientes',
        );
      }
      return true;
    }

    const hasRole = requiredRoles.some((role) => user.roles.includes(role));
    if (!hasRole) {
      throw new ForbiddenException(
        `Acceso denegado: Se requiere uno de los roles [${requiredRoles.join(', ')}]`,
      );
    }

    return true;
  }
}
