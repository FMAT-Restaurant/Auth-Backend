import { RoleEnum } from '../../database/entities/role.entity';

export const ROLE_VIEWS_MAP: Record<RoleEnum, string[]> = {
  [RoleEnum.ADMINISTRADOR]: [
    'admin-dashboard',
    'staff-management',
    'sala-view',
    'menu-view',
    'orders-view',
    'kitchen-view',
    'inventory-view',
    'billing-view',
  ],
  [RoleEnum.HOST]: ['sala-view'],
  [RoleEnum.ALMACENISTA]: ['inventory-view'],
  [RoleEnum.GESTOR_MENU]: ['menu-view'],
  [RoleEnum.MESERO]: ['orders-pos-view'],
  [RoleEnum.CHEF_MASTER]: ['kitchen-kds-view'],
  [RoleEnum.CAJERO]: ['billing-view'],
};

export function resolveViewsForRoles(roles: (string | RoleEnum)[]): string[] {
  const viewsSet = new Set<string>();
  for (const role of roles) {
    const views = ROLE_VIEWS_MAP[role as RoleEnum] || [];
    for (const view of views) {
      viewsSet.add(view);
    }
  }
  return Array.from(viewsSet);
}
