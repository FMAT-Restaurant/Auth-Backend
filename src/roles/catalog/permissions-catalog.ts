export interface PermissionDefinition {
  code: string;
  label: string;
  description: string;
}

export interface ServicePermissionsGroup {
  serviceKey: string;
  serviceName: string;
  iconName?: string;
  permissions: PermissionDefinition[];
}

export const SYSTEM_PERMISSIONS_CATALOG: ServicePermissionsGroup[] = [
  {
    serviceKey: 'inventory',
    serviceName: 'Inventario y Almacén',
    iconName: 'Package',
    permissions: [
      {
        code: 'inventory:view',
        label: 'Ver inventario',
        description: 'Consultar existencias y stock de ingredientes',
      },
      {
        code: 'inventory:ingredients:create',
        label: 'Agregar insumos',
        description: 'Registrar nuevos insumos y productos en bodega',
      },
      {
        code: 'inventory:stock:update_status',
        label: 'Actualizar stock',
        description: 'Modificar cantidades, mermas y estados',
      },
      {
        code: 'inventory:ingredients:delete',
        label: 'Eliminar insumos',
        description: 'Dar de baja materias primas de la base de datos',
      },
    ],
  },
  {
    serviceKey: 'kitchen',
    serviceName: 'Cocina y Pantalla KDS',
    iconName: 'UtensilsCrossed',
    permissions: [
      {
        code: 'kitchen:kds:view',
        label: 'Ver pantalla KDS',
        description: 'Visualizar comandas en cocina y tiempos de preparación',
      },
      {
        code: 'kitchen:order:start_preparation',
        label: 'Iniciar preparación',
        description: 'Marcar platillos en cocción',
      },
      {
        code: 'kitchen:order:mark_ready',
        label: 'Marcar como listo',
        description: 'Notificar que la orden está lista para servir',
      },
    ],
  },
  {
    serviceKey: 'orders',
    serviceName: 'Pedidos y Ventas (POS)',
    iconName: 'Receipt',
    permissions: [
      {
        code: 'orders:view',
        label: 'Ver pedidos',
        description: 'Consultar órdenes en curso y detalle de comandas',
      },
      {
        code: 'orders:create',
        label: 'Crear pedidos',
        description: 'Abrir nuevas órdenes y capturar platillos',
      },
      {
        code: 'orders:cancel',
        label: 'Cancelar pedidos',
        description: 'Anular comandas o platillos con autorización',
      },
    ],
  },
  {
    serviceKey: 'menu',
    serviceName: 'Menú y Carta',
    iconName: 'BookOpen',
    permissions: [
      {
        code: 'menu:view',
        label: 'Ver menú',
        description: 'Consultar carta y catálogo de precios',
      },
      {
        code: 'menu:edit',
        label: 'Editar menú',
        description: 'Modificar precios, recetas y disponibilidad',
      },
    ],
  },
  {
    serviceKey: 'sala',
    serviceName: 'Sala y Mesas',
    iconName: 'LayoutGrid',
    permissions: [
      {
        code: 'sala:tables:view',
        label: 'Ver mapa de mesas',
        description: 'Consultar estado ocupado/libre de mesas',
      },
      {
        code: 'sala:tables:assign_diner',
        label: 'Asignar comensales',
        description: 'Ubicar clientes en mesas disponibles',
      },
      {
        code: 'sala:tables:assign_waiter',
        label: 'Asignar mesero',
        description: 'Vincular mesero responsable a la mesa',
      },
    ],
  },
  {
    serviceKey: 'billing',
    serviceName: 'Facturación y Caja',
    iconName: 'CreditCard',
    permissions: [
      {
        code: 'billing:invoices:create',
        label: 'Emitir comprobantes',
        description: 'Generar tickets de pago y facturas',
      },
      {
        code: 'billing:reports:view',
        label: 'Ver reportes de caja',
        description: 'Consultar ingresos del turno y arqueo',
      },
    ],
  },
  {
    serviceKey: 'staff',
    serviceName: 'Personal y Seguridad',
    iconName: 'Users',
    permissions: [
      {
        code: 'staff:view',
        label: 'Ver colaboradores',
        description: 'Consultar lista de colaboradores y perfiles',
      },
      {
        code: 'staff:manage',
        label: 'Gestionar colaboradores y roles',
        description: 'Crear, editar, restablecer claves y crear roles',
      },
    ],
  },
];
